// MODULO PUBLICO do fornecedor (Fase 2). Isolamento comercial: nao importa o modulo do comprador
// nem toca preco-base/adjudicacao (scripts/verificar-arquitetura.mjs quebra o build se tocar). O
// tipo `ConviteAutenticado` so e cunhado por `autenticarConvitePorToken`: quem tem so um uuid nao
// consegue construir o tipo e nao compila a chamada.
import { createHash } from "node:crypto";
import type { DadosExternos } from "@padaria/shared/api";
import type {
  PedidoPublicoDto,
  ProdutoParaFornecedorDto,
  RespostaItemPublica,
  ResponderRodadaPayload,
  RodadaPublicaDto
} from "@padaria/shared/compras";
import {
  contrapropostaVigente,
  itensDoAceite,
  produtosDoFornecedorPayloadSchema,
  responderRodadaPayloadSchema,
  situacaoDoItemParaFornecedor
} from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, foiEmbora, naoEncontrado } from "../erros.js";
import {
  buscarConvitePorHashRepository,
  conviteItemIdsRepository,
  criarPropostaFornecedorRepository,
  itensDoConviteRepository,
  marcarConviteRespondidoRepository,
  produtosParaFornecedorRepository,
  proximaVersaoRepository,
  travarConvitePorHashRepository,
  ultimaPropostaDoConviteRepository,
  versoesDoConviteRepository,
  vincularProdutosDoFornecedorRepository,
  type ConvitePublicoLinha
} from "./rodada-publica.repository.js";

declare const marcaConvite: unique symbol;
/** Convite ja autenticado por token. So `autenticarConvitePorToken` cunha; o `[marcaConvite]` e privado. */
export type ConviteAutenticado = ConvitePublicoLinha & { readonly [marcaConvite]: true };

function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function exigirToken(token: string | undefined): string {
  if (!token) throw naoEncontrado("Convite nao encontrado", "RODADA_TOKEN_AUSENTE");
  return token;
}

/**
 * Unica porta de entrada do token: devolve o convite marcado ou 404. Nao decide se esta no prazo —
 * quem le (obter) mostra "encerrada"; quem escreve (responder) recusa com 410.
 */
export async function autenticarConvitePorToken(token: string | undefined): Promise<ConviteAutenticado> {
  const linha = await buscarConvitePorHashRepository(hashToken(exigirToken(token)));
  if (!linha) throw naoEncontrado("Convite nao encontrado", "RODADA_CONVITE_INVALIDO");
  return linha as ConviteAutenticado;
}

function rodadaViva(convite: ConviteAutenticado): boolean {
  return (
    convite.rodadaStatus === "aberta" &&
    convite.expiraEm.getTime() > Date.now() &&
    (convite.conviteStatus === "aberto" || convite.conviteStatus === "aguardando_comprador")
  );
}

/**
 * `itensComprados` e INJETADO pelo controller: saber que um item ja tem vencedor exige ler a tabela de
 * adjudicacao, que este modulo nao pode tocar (verificar-arquitetura). O resolvedor devolve so quais
 * itens DESTE convite ja foram comprados — nunca quem venceu nem por quanto.
 */
export async function obterRodadaPublica(
  token: string | undefined,
  itensComprados: (conviteId: string) => Promise<Set<string>>,
  // Doc 57 §5 (passo 2): o pedido que ele ja ganhou. Tambem INJETADO — e leitura de pedido/adjudicacao.
  pedidoDoConvite: (conviteId: string) => Promise<PedidoPublicoDto | null>
): Promise<RodadaPublicaDto> {
  const convite = await autenticarConvitePorToken(token);
  const [itens, ultima, versoes, comprados, pedido] = await Promise.all([
    itensDoConviteRepository(convite.conviteId),
    ultimaPropostaDoConviteRepository(convite.conviteId),
    versoesDoConviteRepository(convite.conviteId),
    itensComprados(convite.conviteId),
    pedidoDoConvite(convite.conviteId)
  ]);
  const viva = rodadaViva(convite);
  const precificados = new Set(
    (ultima?.itens ?? [])
      .filter((item) => !item.indisponivel && item.valorUnitario !== null)
      .map((item) => item.conviteItemId)
  );
  const contraproposta = viva ? contrapropostaVigente(versoes) : [];
  const versaoDaContraproposta = Math.max(
    0,
    ...versoes.filter((versao) => versao.autorTipo === "comprador").map((versao) => versao.versao)
  );
  return {
    fornecedorNome: convite.fornecedorNome,
    empresaNome: convite.empresaNome,
    expiraEm: convite.expiraEm.toISOString(),
    margemVariacaoPercentual: convite.margemVariacaoPercentual,
    situacao: viva ? "aberta" : "encerrada",
    itens: itens.map((item) => ({
      conviteItemId: item.conviteItemId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      referencia: item.referencia,
      situacao: situacaoDoItemParaFornecedor({
        comprado: comprados.has(item.conviteItemId),
        ofereceuPreco: precificados.has(item.conviteItemId)
      })
    })),
    contraproposta: contraproposta.length ? { versao: versaoDaContraproposta, itens: contraproposta } : null,
    ultimaProposta: ultima
      ? {
          versao: ultima.versao,
          frete: ultima.frete,
          observacao: ultima.observacao,
          prazoEntrega: ultima.prazoEntrega,
          condicaoPagamento: ultima.condicaoPagamento,
          itens: ultima.itens.map((item) => ({
            conviteItemId: item.conviteItemId,
            indisponivel: item.indisponivel,
            motivoIndisponivel: item.motivoIndisponivel,
            valorUnitario: item.valorUnitario,
            quantidadeDisponivel: item.quantidadeDisponivel
          }))
        }
      : null,
    pedido
  };
}

export async function responderRodadaPublica(
  token: string | undefined,
  body: DadosExternos
): Promise<{ versao: number; propostaId: string }> {
  const payload: ResponderRodadaPayload = responderRodadaPayloadSchema.parse(body ?? {});
  // Autentica FORA da transacao so para obter a solicitacao (chave do advisory) e falhar cedo.
  const convite = await autenticarConvitePorToken(token);
  if (!rodadaViva(convite)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

  return executarEmTransacao(async (tx) => {
    // Ordem canonica: advisory por solicitacao -> convite FOR UPDATE.
    await tx.execute(sqlTravarRodadaDeCompras(convite.solicitacaoId));
    const travado = await travarConvitePorHashRepository(hashToken(exigirToken(token)), tx);
    if (!travado) throw naoEncontrado("Convite nao encontrado", "RODADA_CONVITE_INVALIDO");
    // Reconfere o estado ja com a trava (o prazo/fechamento pode ter corrido entre a leitura e a trava).
    const atual = await autenticarConvitePorToken(token);
    if (!rodadaViva(atual)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

    const itensValidos = await conviteItemIdsRepository(travado.id, tx);
    for (const item of payload.itens) {
      if (!itensValidos.has(item.conviteItemId)) {
        throw erroValidacao("Item nao pertence a este convite", "ITEM_FORA_DO_CONVITE");
      }
    }
    if (new Set(payload.itens.map((item) => item.conviteItemId)).size !== payload.itens.length) {
      throw erroValidacao("Item repetido na mesma resposta", "ITEM_DUPLICADO");
    }

    const versao = await proximaVersaoRepository(travado.id, tx);
    const propostaId = await criarPropostaFornecedorRepository(
      {
        empresaId: travado.empresaId,
        conviteId: travado.id,
        versao,
        frete: payload.frete ?? null,
        observacao: payload.observacao ?? null,
        prazoEntrega: payload.prazoEntrega ?? null,
        condicaoPagamento: payload.condicaoPagamento ?? null,
        itens: payload.itens.map((item: RespostaItemPublica) => ({
          conviteItemId: item.conviteItemId,
          indisponivel: item.indisponivel,
          motivoIndisponivel: item.indisponivel ? (item.motivoIndisponivel ?? "sem_estoque") : null,
          valorUnitario: item.indisponivel ? null : (item.valorUnitario ?? null),
          quantidadeDisponivel: item.indisponivel ? null : (item.quantidadeDisponivel ?? null)
        }))
      },
      tx
    );
    await marcarConviteRespondidoRepository(travado.id, travado.empresaId, tx);
    return { versao, propostaId };
  });
}

/**
 * O fornecedor ACEITA a contraproposta do comprador (R-221 decisao 7): vira a versao N+1 DELE, com o
 * valor da contraproposta nos itens contrapostos e o que ele ja tinha nos demais (frete, prazo e
 * condicao tambem). O controller entrega essa versao ao mesmo portao da compra automatica que
 * qualquer resposta atravessa. Mesma serializacao da resposta: advisory da solicitacao, convite FOR UPDATE.
 */
export async function aceitarContrapropostaPublica(
  token: string | undefined
): Promise<{ versao: number; propostaId: string }> {
  const convite = await autenticarConvitePorToken(token);
  if (!rodadaViva(convite)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

  return executarEmTransacao(async (tx) => {
    await tx.execute(sqlTravarRodadaDeCompras(convite.solicitacaoId));
    const travado = await travarConvitePorHashRepository(hashToken(exigirToken(token)), tx);
    if (!travado) throw naoEncontrado("Convite nao encontrado", "RODADA_CONVITE_INVALIDO");
    const atual = await autenticarConvitePorToken(token);
    if (!rodadaViva(atual)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

    const versoes = await versoesDoConviteRepository(travado.id, tx);
    const contraproposta = contrapropostaVigente(versoes);
    const ultimaDoFornecedor = versoes.filter((versao) => versao.autorTipo === "fornecedor").at(-1);
    const ultima = await ultimaPropostaDoConviteRepository(travado.id, tx);
    if (!contraproposta.length || !ultimaDoFornecedor || !ultima) {
      throw conflito("Nao ha contraproposta esperando resposta", "SEM_CONTRAPROPOSTA");
    }

    const versao = await proximaVersaoRepository(travado.id, tx);
    const propostaId = await criarPropostaFornecedorRepository(
      {
        empresaId: travado.empresaId,
        conviteId: travado.id,
        versao,
        frete: ultima.frete === null ? null : Number(ultima.frete),
        observacao: ultima.observacao,
        prazoEntrega: ultima.prazoEntrega,
        condicaoPagamento: ultima.condicaoPagamento,
        itens: itensDoAceite(ultimaDoFornecedor, contraproposta).map((item) => {
          const anterior = ultima.itens.find((linha) => linha.conviteItemId === item.conviteItemId);
          return {
            conviteItemId: item.conviteItemId,
            indisponivel: item.indisponivel,
            motivoIndisponivel: item.indisponivel ? (anterior?.motivoIndisponivel ?? "sem_estoque") : null,
            valorUnitario: item.valorUnitario === null ? null : Number(item.valorUnitario),
            quantidadeDisponivel:
              item.indisponivel || !anterior?.quantidadeDisponivel ? null : Number(anterior.quantidadeDisponivel)
          };
        })
      },
      tx
    );
    await marcarConviteRespondidoRepository(travado.id, travado.empresaId, tx);
    return { versao, propostaId };
  });
}

// --- doc 57 §5.1: o que mais o fornecedor vende ----------------------------------------------------

/** A lista do que a padaria compra (so nome e grupo), marcando o que este fornecedor ja vende. */
export async function produtosParaFornecedor(token: string | undefined): Promise<ProdutoParaFornecedorDto[]> {
  const convite = await autenticarConvitePorToken(token);
  const linhas = await produtosParaFornecedorRepository(convite.empresaId, convite.fornecedorId);
  return linhas.map((linha) => ({
    produtoId: linha.produtoId,
    descricao: linha.descricao ?? "Produto",
    grupo: linha.grupo,
    jaVende: linha.vinculo === "aprovado" || linha.vinculo === "pendente"
  }));
}

/** Ele marca o que vende: a partir da proxima cotacao, recebe tambem esses produtos. */
export async function marcarProdutosQueVende(
  token: string | undefined,
  body: DadosExternos
): Promise<{ vinculados: number }> {
  const payload = produtosDoFornecedorPayloadSchema.parse(body ?? {});
  const convite = await autenticarConvitePorToken(token);
  const vinculados = await executarEmTransacao((tx) =>
    vincularProdutosDoFornecedorRepository(
      { empresaId: convite.empresaId, fornecedorId: convite.fornecedorId, produtoIds: payload.produtoIds },
      tx
    )
  );
  return { vinculados };
}

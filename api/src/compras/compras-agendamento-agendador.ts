import type { DadosExternos } from "@padaria/shared/api";
import { podeConvidar } from "@padaria/shared";
import { localDoInstante, quantidadeSugerida } from "@padaria/shared/compras";
import { executarEmTransacao } from "../banco/conexao.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { buscarProdutosEstoqueRepository } from "../pedidos/pedidos.repository.js";
import {
  agendasAtivasRepository,
  cancelarSolicitacaoDoAgendamentoRepository,
  criarSolicitacaoDoAgendamentoRepository,
  fornecedoresDoCatalogoRepository,
  ocorrenciaPorPrevistoRepository,
  ocorrenciasDasAgendasRepository,
  produtosDasAgendasRepository,
  registrarOcorrenciaRepository,
  travarAgendaRepository
} from "./compras-agendamento.repository.js";
import { instantesDaSerie, terminoDaLinha } from "./compras-agendamento.service.js";
import { abrirRodadaNaTransacao } from "./compras-rodadas.service.js";
import type { ItemEntrada } from "./compras-solicitacoes.repository.js";

// Agendador do agendamento de pedido (doc 56 §4, doc 57 §2). Roda no tick de Compras (60 s, server.ts): cada
// data que chegou vira a rodada de cotacao, e a fila do WhatsApp manda o link para cada fornecedor. Nunca
// confirma pedido nem mexe em estoque. Idempotente: a agenda e travada e o UNIQUE(agenda, previsto_para)
// impede a mesma data duas vezes.

type Agenda = Awaited<ReturnType<typeof agendasAtivasRepository>>[number];

async function datasDevidas(agenda: Agenda, agora: Date): Promise<Array<{ previstoPara: Date; dataAtual: Date }>> {
  const hoje = localDoInstante(agora, agenda.fusoHorario).data;
  const registradas = new Map(
    (await ocorrenciasDasAgendasRepository([agenda.id])).map((ocorrencia) => [
      ocorrencia.previstoPara.getTime(),
      ocorrencia
    ])
  );
  const devidas: Array<{ previstoPara: Date; dataAtual: Date }> = [];
  for (const previstoPara of instantesDaSerie({ ...agenda, termino: terminoDaLinha(agenda) }, hoje)) {
    const registrada = registradas.get(previstoPara.getTime());
    // Ja aconteceu ou foi cancelada: nada a fazer. Movida ("so esta"): vale a data nova.
    if (registrada && registrada.situacao !== "agendada") continue;
    const dataAtual = registrada?.dataAtual ?? previstoPara;
    if (dataAtual <= agora) devidas.push({ previstoPara, dataAtual });
  }
  // Data movida para DEPOIS do fim do calculo de hoje ja esta registrada: so vence quando chegar.
  for (const registrada of registradas.values())
    if (
      registrada.situacao === "agendada" &&
      registrada.dataAtual <= agora &&
      !devidas.some((devida) => devida.previstoPara.getTime() === registrada.previstoPara.getTime())
    )
      devidas.push({ previstoPara: registrada.previstoPara, dataAtual: registrada.dataAtual });
  return devidas;
}

/** Para cada fornecedor que pode receber cotacao, os itens da solicitacao que ele vende (catalogo aprovado). */
export function convitesDoCatalogo(
  itens: Array<{ id: string; produtoId: string }>,
  catalogo: Array<{ produtoId: string; fornecedorId: string; situacao: string; whatsapp: string | null }>
) {
  const itemPorProduto = new Map(itens.map((item) => [item.produtoId, item.id]));
  const porFornecedor = new Map<string, string[]>();
  for (const vinculo of catalogo) {
    const solicitacaoItemId = itemPorProduto.get(vinculo.produtoId);
    if (!solicitacaoItemId) continue;
    if (podeConvidar({ situacao: vinculo.situacao as "ativo" | "inativo", whatsapp: vinculo.whatsapp })) continue;
    const lista = porFornecedor.get(vinculo.fornecedorId) ?? [];
    if (!lista.includes(solicitacaoItemId)) lista.push(solicitacaoItemId);
    porFornecedor.set(vinculo.fornecedorId, lista);
  }
  const comFornecedor = new Set([...porFornecedor.values()].flat());
  return {
    convites: [...porFornecedor].map(([fornecedorId, solicitacaoItemIds]) => ({ fornecedorId, solicitacaoItemIds })),
    aFazer: itens.filter((item) => !comFornecedor.has(item.id)).length
  };
}

async function materializar(agenda: Agenda, devida: { previstoPara: Date; dataAtual: Date }) {
  await executarEmTransacao(async (tx) => {
    const travada = await travarAgendaRepository(agenda.id, agenda.empresaId, tx);
    if (!travada || travada.status !== "ativa") return;
    const atual = await ocorrenciaPorPrevistoRepository(agenda.id, devida.previstoPara, tx);
    if (atual && atual.situacao !== "agendada") return;

    const [produtosDaAgenda, estoque] = await Promise.all([
      produtosDasAgendasRepository([agenda.id], tx),
      buscarProdutosEstoqueRepository(agenda.empresaId, tx)
    ]);
    const estoquePorId = new Map(estoque.map((produto) => [produto.id, produto]));
    // Quantidade padrao do agendamento; sem ela, a sugestao do estoque (maximo - saldo). Sem nenhuma das
    // duas (ou com o estoque cheio) o produto nao entra neste pedido.
    const itens: ItemEntrada[] = produtosDaAgenda.flatMap((produto) => {
      const posicao = estoquePorId.get(produto.produtoId);
      const quantidade =
        produto.quantidadePadrao !== null
          ? Number(produto.quantidadePadrao)
          : quantidadeSugerida(posicao?.quantidadeEstoque ?? null, posicao?.estoqueMax ?? null);
      if (!quantidade) return [];
      return [
        {
          produtoId: produto.produtoId,
          descricaoProduto: posicao?.descricao ?? produto.descricao ?? "Produto",
          quantidade,
          estoqueAtual: posicao?.quantidadeEstoque ?? null,
          estoqueMin: posicao?.estoqueMin ?? null,
          estoqueMax: posicao?.estoqueMax ?? null
        }
      ];
    });
    const solicitacao = await criarSolicitacaoDoAgendamentoRepository(
      {
        empresaId: agenda.empresaId,
        criadoPor: agenda.responsavelId,
        observacao: `Agendamento de pedido: ${agenda.grupoNome}`,
        itens
      },
      tx
    );
    const dataDoDia = {
      empresaId: agenda.empresaId,
      agendaId: agenda.id,
      previstoPara: devida.previstoPara,
      dataAtual: devida.dataAtual,
      solicitacaoId: solicitacao.id
    };
    if (!solicitacao.itens.length) {
      // Nada a repor: a data passa como cancelada, sem rodada vazia na rua.
      await cancelarSolicitacaoDoAgendamentoRepository(solicitacao.id, tx);
      await registrarOcorrenciaRepository(
        { ...dataDoDia, situacao: "cancelada", canceladaPor: agenda.responsavelId },
        tx
      );
      return;
    }
    // A ocorrencia nasce ligada a solicitacao e vira "enviada" dentro de abrirRodadaNaTransacao.
    const ocorrencia = await registrarOcorrenciaRepository(
      { ...dataDoDia, situacao: "aguardando_conferencia", canceladaPor: null },
      tx
    );

    // Doc 57 §2: cada fornecedor do catalogo (com WhatsApp) recebe SO os seus produtos, sem ninguem
    // conferir. Produto sem fornecedor que possa receber fica "A fazer" na tela de Pedidos.
    const catalogo = await fornecedoresDoCatalogoRepository(
      agenda.empresaId,
      solicitacao.itens.map((item) => item.produtoId),
      tx
    );
    const { convites, aFazer } = convitesDoCatalogo(solicitacao.itens, catalogo);
    await abrirRodadaNaTransacao(
      {
        empresaId: agenda.empresaId,
        solicitacaoId: solicitacao.id,
        prazoRespostaHoras: agenda.prazoRespostaHoras,
        tetoValor: null,
        margemVariacaoPercentual: agenda.margemVariacaoPercentual as 10 | 20 | 30 | 40,
        convites
      },
      agenda.responsavelId,
      tx,
      { permitirSemConvites: true }
    );
    if (aFazer)
      await criarNotificacoesRepository(
        {
          empresaId: agenda.empresaId,
          tipo: "compras_agendamento_conferir",
          destinatariosUsuarioIds: [agenda.responsavelId],
          referenciaId: ocorrencia.id,
          titulo: `Pedido agendado (${agenda.grupoNome}): ${aFazer} produto(s) sem fornecedor ficaram A fazer`
        },
        tx
      );
  });
}

/** Uma transacao por data: uma agenda com problema nao impede as outras. */
export async function materializarAgendamentos(
  agora: Date,
  aoFalhar: (agendaId: string, erro: DadosExternos) => void
): Promise<number> {
  let criadas = 0;
  for (const agenda of await agendasAtivasRepository()) {
    try {
      for (const devida of await datasDevidas(agenda, agora)) {
        await materializar(agenda, devida);
        criadas += 1;
      }
    } catch (erro) {
      aoFalhar(agenda.id, erro);
    }
  }
  return criadas;
}

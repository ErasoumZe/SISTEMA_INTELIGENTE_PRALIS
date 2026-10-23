import type { DadosExternos } from "@padaria/shared/api";
import { localDoInstante, quantidadeSugerida } from "@padaria/shared/compras";
import { executarEmTransacao } from "../banco/conexao.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { buscarProdutosEstoqueRepository } from "../pedidos/pedidos.repository.js";
import {
  agendasAtivasRepository,
  criarSolicitacaoDoAgendamentoRepository,
  ocorrenciaPorPrevistoRepository,
  ocorrenciasDasAgendasRepository,
  produtosDasAgendasRepository,
  registrarOcorrenciaRepository,
  travarAgendaRepository
} from "./compras-agendamento.repository.js";
import { instantesDaSerie, terminoDaLinha } from "./compras-agendamento.service.js";
import type { ItemEntrada } from "./compras-solicitacoes.repository.js";

// Agendador do agendamento de pedido (doc 56 §4, doc 58 §2). Roda no tick de Compras (60 s, server.ts): cada
// data que chegou vira a solicitacao do dia (com as quantidades sugeridas) e o responsavel e avisado no sino;
// ele confere e envia pela tela Solicitacao de compra. Nunca envia cotacao nem mexe em estoque. Idempotente: a
// agenda e travada e o UNIQUE(agenda, previsto_para) impede a mesma data duas vezes.

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
    // A sugestao que o responsavel ve: a quantidade padrao do agendamento ou maximo - saldo. Sem nenhuma das
    // duas, o produto aparece na solicitacao sem quantidade e ele decide.
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
    const ocorrencia = await registrarOcorrenciaRepository(
      {
        empresaId: agenda.empresaId,
        agendaId: agenda.id,
        previstoPara: devida.previstoPara,
        dataAtual: devida.dataAtual,
        situacao: "aguardando_conferencia",
        solicitacaoId: solicitacao.id,
        canceladaPor: null
      },
      tx
    );
    // Doc 58 §2: o responsavel e avisado e envia pela tela Solicitacao de compra.
    await criarNotificacoesRepository(
      {
        empresaId: agenda.empresaId,
        tipo: "compras_agendamento_conferir",
        destinatariosUsuarioIds: [agenda.responsavelId],
        referenciaId: ocorrencia.id,
        titulo: `Solicitação de compra para enviar: ${agenda.grupoNome}`
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

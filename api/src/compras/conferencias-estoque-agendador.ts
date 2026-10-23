import type { DadosExternos } from "@padaria/shared/api";
import { ROTULO_RANKING_CONFERENCIA, localDoInstante } from "@padaria/shared/compras";
import { executarEmTransacao } from "../banco/conexao.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { gruposDaEmpresaRepository } from "./compras-agendamento.repository.js";
import { instantesDaSerie, rankingsDaEmpresa, terminoDaLinha } from "./compras-agendamento.service.js";
import { listarEstoqueProdutosRepository } from "./compras.repository.js";
import {
  agendasConferenciaAtivasRepository,
  criarConferenciaDoDiaRepository,
  datasJaCriadasRepository
} from "./conferencias-estoque.repository.js";

// Agendador da conferencia de estoque (doc 57 §1). Roda no tick de Compras (60 s, server.ts): cada data que
// chegou vira uma conferencia com a lista de produtos do recorte e o saldo do sistema naquele momento, e o
// responsavel e avisado no sino. Idempotente pelo UNIQUE(agenda, previsto_para).

type Agenda = Awaited<ReturnType<typeof agendasConferenciaAtivasRepository>>[number];

/** Os produtos do recorte: area e locais no banco; grupo (com os subgrupos) e ranking aqui. */
async function produtosDoRecorte(agenda: Agenda, agora: Date) {
  const [estoque, grupos, rankings] = await Promise.all([
    listarEstoqueProdutosRepository({
      empresaId: agenda.empresaId,
      areaEstoque: agenda.areaEstoque ?? undefined,
      localEstoque: agenda.localEstoque ?? undefined,
      localVenda: agenda.localVenda ?? undefined
    }),
    agenda.grupoMercadoriaId ? gruposDaEmpresaRepository(agenda.empresaId) : Promise.resolve([]),
    agenda.ranking ? rankingsDaEmpresa(agenda.empresaId, agora) : Promise.resolve(null)
  ]);
  const gruposAceitos = new Set(
    agenda.grupoMercadoriaId
      ? [
          agenda.grupoMercadoriaId,
          ...grupos.filter((grupo) => grupo.grupoPaiId === agenda.grupoMercadoriaId).map((grupo) => grupo.id)
        ]
      : []
  );
  const topo =
    agenda.ranking === "mais_vendidos"
      ? rankings?.maisVende
      : agenda.ranking === "mais_comprados"
        ? rankings?.maisCompra
        : agenda.ranking === "mais_lucro"
          ? rankings?.maisLucro
          : undefined;
  return estoque.filter(
    (produto) =>
      (!agenda.grupoMercadoriaId || (produto.grupoMercadoriaId && gruposAceitos.has(produto.grupoMercadoriaId))) &&
      (!topo || topo.has(produto.id))
  );
}

function tituloDoAviso(agenda: Agenda) {
  const partes = [
    agenda.grupo,
    agenda.ranking ? ROTULO_RANKING_CONFERENCIA[agenda.ranking] : null,
    agenda.areaEstoque,
    agenda.localEstoque
  ].filter(Boolean);
  return `Conferência de estoque para fazer${partes.length ? `: ${partes.join(" · ")}` : ""}`;
}

async function materializar(agenda: Agenda, previstoPara: Date, agora: Date) {
  const produtos = await produtosDoRecorte(agenda, agora);
  await executarEmTransacao(async (tx) => {
    const id = await criarConferenciaDoDiaRepository(
      {
        empresaId: agenda.empresaId,
        agendaId: agenda.id,
        previstoPara,
        responsavelId: agenda.responsavelId,
        grupoMercadoriaId: agenda.grupoMercadoriaId,
        ranking: agenda.ranking,
        areaEstoque: agenda.areaEstoque,
        localEstoque: agenda.localEstoque,
        localVenda: agenda.localVenda,
        observacao: agenda.observacao,
        criadoPor: agenda.criadoPor,
        itens: produtos.map((produto) => ({ produtoId: produto.id, saldoSistema: produto.quantidadeEstoque }))
      },
      tx
    );
    if (!id) return;
    await criarNotificacoesRepository(
      {
        empresaId: agenda.empresaId,
        tipo: "conferencia_estoque_fazer",
        destinatariosUsuarioIds: [agenda.responsavelId],
        referenciaId: id,
        titulo: tituloDoAviso(agenda)
      },
      tx
    );
  });
}

/** Uma transacao por data: uma agenda com problema nao impede as outras. */
export async function materializarConferencias(
  agora: Date,
  aoFalhar: (agendaId: string, erro: DadosExternos) => void
): Promise<number> {
  let criadas = 0;
  for (const agenda of await agendasConferenciaAtivasRepository()) {
    try {
      const hoje = localDoInstante(agora, agenda.fusoHorario).data;
      const jaCriadas = await datasJaCriadasRepository(agenda.id);
      const devidas = instantesDaSerie({ ...agenda, termino: terminoDaLinha(agenda) }, hoje).filter(
        (data) => data <= agora && !jaCriadas.has(data.getTime())
      );
      for (const previstoPara of devidas) {
        await materializar(agenda, previstoPara, agora);
        criadas += 1;
      }
    } catch (erro) {
      aoFalhar(agenda.id, erro);
    }
  }
  return criadas;
}

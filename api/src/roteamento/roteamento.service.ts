import { deCentavos } from "@padaria/shared/dinheiro";
import {
  formasSemRoteamentoRepository,
  totaisRoteamentoPendenteRepository,
  vendasComRoteamentoPendenteRepository
} from "./roteamento.repository.js";

const LIMITE_LISTA_PENDENCIAS = 100;

export type PendenciasRoteamento = {
  formasSemRoteamento: Array<{ id: string; empresaId: string; nome: string }> | null;
  vendasPendentes: {
    totalPagamentos: number;
    totalVendas: number;
    valorTotal: number;
    listaTruncada: boolean;
    itens: Array<{
      vendaId: string;
      identificadorExterno: string | null;
      dataReferencia: string;
      pdv: string | null;
      formaPagamento: string | null;
      valor: number;
    }>;
  } | null;
};

/**
 * As duas metades da pendencia, cada uma atras da SUA permissao.
 *
 * `formasSemRoteamento` e trabalho de configuracao: quem tem a permissao dedicada da R-176 precisa
 * ver o que falta configurar. Nao carrega valor nenhum.
 *
 * `vendasPendentes` e dinheiro: quantas vendas e quanto esta parado fora de conta. Isto e faturamento
 * agregado e NAO pode chegar a quem so tem permissao cadastral — foi o achado do revisor de seguranca
 * no doc 32 §13. Por isso as duas metades sao decididas separadamente, e cada uma vem `null` quando
 * o solicitante nao pode ve-la. `null` diz "voce nao ve isto"; lista vazia diz "nao ha nada".
 */
export async function listarPendenciasRoteamento(
  escopoEmpresas: string[],
  acesso: { podeConfigurar: boolean; podeVerFinanceiro: boolean }
): Promise<PendenciasRoteamento> {
  const formasSemRoteamento = acesso.podeConfigurar ? await formasSemRoteamentoRepository(escopoEmpresas) : null;

  if (!acesso.podeVerFinanceiro) return { formasSemRoteamento, vendasPendentes: null };

  const totais = await totaisRoteamentoPendenteRepository(escopoEmpresas);
  const itens = await vendasComRoteamentoPendenteRepository(escopoEmpresas, LIMITE_LISTA_PENDENCIAS);

  return {
    formasSemRoteamento,
    vendasPendentes: {
      totalPagamentos: totais.pagamentos,
      totalVendas: totais.vendas,
      valorTotal: deCentavos(totais.totalCentavos),
      // A tela precisa saber que esta vendo uma parte. Contador truncado em silencio e pior do que
      // nao mostrar contador.
      listaTruncada: totais.pagamentos > itens.length,
      itens: itens.map((item) => ({
        vendaId: item.vendaId,
        identificadorExterno: item.identificadorExterno,
        dataReferencia: item.dataReferencia,
        pdv: item.pdvAutomacao,
        formaPagamento: item.formaPagamento,
        valor: Number(item.totalPago)
      }))
    }
  };
}

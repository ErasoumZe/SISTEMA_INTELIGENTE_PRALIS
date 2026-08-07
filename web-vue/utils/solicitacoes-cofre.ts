// Acoes da Tesouraria sobre as SOLICITACOES de entrega ao cofre (D4), extraidas do componente
// pelo mesmo motivo de `caixa-acoes.ts`: assim dao para testar com fakes, sem runtime Nuxt.
//
// A retaguarda PROGRAMA (nasce 'agendada', nao movimenta dinheiro) e pode CANCELAR enquanto
// ninguem executou. Quem executa e o operador, na tela do Caixa — nao existe botao de executar aqui.
import type { DadosExternos } from "@padaria/shared";
import type { SolicitacaoCofre } from "~/types/padaria";

type PortApiSolicitacoes = {
  get: <T>(rota: string) => Promise<T>;
  post: <T>(rota: string, body: DadosExternos) => Promise<T>;
};

// Sem `confirmar`: o dialogo de motivo do painel JA e a confirmacao do cancelamento. Ter os dois
// obrigava a retaguarda a confirmar duas vezes o mesmo ato — e a segunda caixa nem dizia o motivo
// que ela tinha acabado de digitar.
export type DepsSolicitacoesCofre = {
  api: PortApiSolicitacoes;
  notificar: (mensagem: string, tipo?: string) => void;
  mensagemErro: (error: DadosExternos) => string;
};

export type ProgramarSolicitacaoPayload = {
  caixaId: string;
  tipo: "sangria" | "retorno";
  valor: number;
  observacao: string | null;
  // B2: a chave e da INTENCAO. Quem a gera e a tela, uma vez, e a conserva no retry — e o que
  // impede a mesma ordem de dinheiro de virar duas por causa de um POST reenviado.
  idempotenciaChave: string;
};

export function criarAcoesSolicitacoesCofre(deps: DepsSolicitacoesCofre) {
  async function listar(caixaId: string): Promise<SolicitacaoCofre[]> {
    try {
      const resposta = await deps.api.get<{ data: SolicitacaoCofre[] }>(`/api/caixa/${caixaId}/solicitacoes-cofre`);
      return resposta.data ?? [];
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return [];
    }
  }

  async function programar(payload: ProgramarSolicitacaoPayload): Promise<SolicitacaoCofre[] | null> {
    try {
      const resposta = await deps.api.post<{ data: SolicitacaoCofre[] }>(
        `/api/caixa/${payload.caixaId}/solicitacoes-cofre`,
        {
          tipo: payload.tipo,
          valor: payload.valor,
          observacao: payload.observacao,
          idempotenciaChave: payload.idempotenciaChave
        }
      );
      deps.notificar("Entrega programada com sucesso.");
      return resposta.data ?? [];
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return null;
    }
  }

  // Cancelar exige motivo — o banco tambem exige (transferencias_cancelamento_check), entao pedir
  // aqui e so evitar um 400 previsivel. A solicitacao NAO e apagada: fica no historico cancelada.
  //
  // Devolve `null` em erro para a tela PRESERVAR o motivo digitado e a solicitacao selecionada:
  // limpar antes da resposta obrigava a redigitar o motivo a cada falha de rede.
  async function cancelar(caixaId: string, solicitacaoId: string, motivo: string): Promise<SolicitacaoCofre[] | null> {
    if (!motivo.trim()) {
      deps.notificar("Informe o motivo do cancelamento.", "error");
      return null;
    }
    try {
      const resposta = await deps.api.post<{ data: SolicitacaoCofre[] }>(
        `/api/caixa/${caixaId}/solicitacoes-cofre/${solicitacaoId}/cancelar`,
        { motivo: motivo.trim() }
      );
      deps.notificar("Solicitação cancelada.");
      return resposta.data ?? [];
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return null;
    }
  }

  return { listar, programar, cancelar };
}

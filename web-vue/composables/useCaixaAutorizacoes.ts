import { ref } from "vue";
import type { AlterarHorarioCaixaResponse, AutorizadorCaixa, SolicitacaoAutorizacaoCaixa } from "@padaria/shared";

// Fluxo de autorizacao/token para alteracao de horario do caixa (PR2). Gerente/admin altera direto;
// operador solicita a um autorizador, que gera um token de uso unico (15 min). Encapsula as chamadas
// de API e a fila do autorizador. Reusa useApi (sessao por cookie).
export function useCaixaAutorizacoes() {
  const { apiGet, apiPost, apiPut } = useApi();

  const autorizadores = ref<AutorizadorCaixa[]>([]);
  const pendentes = ref<SolicitacaoAutorizacaoCaixa[]>([]);
  const carregandoPendentes = ref(false);

  async function carregarAutorizadores(empresaId: string) {
    autorizadores.value = await apiGet<AutorizadorCaixa[]>(`/api/caixa/autorizadores?empresaId=${empresaId}`);
  }

  async function carregarPendentes(empresaId: string) {
    carregandoPendentes.value = true;
    try {
      pendentes.value = await apiGet<SolicitacaoAutorizacaoCaixa[]>(
        `/api/caixa/autorizacoes/pendentes?empresaId=${empresaId}`
      );
    } finally {
      carregandoPendentes.value = false;
    }
  }

  // Observacao SEMPRE obrigatoria; token so para quem nao tem caixa_alterar_horario.
  function alterarHorario(
    caixaId: string,
    body: { dataHoraAbertura?: string; dataHoraFechamento?: string; token?: string; observacao: string }
  ) {
    return apiPut<AlterarHorarioCaixaResponse>(`/api/caixa/${caixaId}/horario`, body);
  }

  function solicitarAutorizacao(caixaId: string, body: { autorizadorId: string; observacao: string | null }) {
    return apiPost<{ id: string }>(`/api/caixa/${caixaId}/autorizacoes`, body);
  }

  // Token retornado UMA vez (o backend guarda so o hash).
  function gerarToken(autorizacaoId: string) {
    return apiPost<{ token: string; expiraEm: string }>(`/api/caixa/autorizacoes/${autorizacaoId}/token`, {});
  }

  return {
    autorizadores,
    pendentes,
    carregandoPendentes,
    carregarAutorizadores,
    carregarPendentes,
    alterarHorario,
    solicitarAutorizacao,
    gerarToken
  };
}

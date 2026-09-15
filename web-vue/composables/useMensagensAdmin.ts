import { ref } from "vue";
import type {
  AlvoMensagem,
  MensagemAdmin,
  MensagemAdminDetalhe,
  MensagemAdminDoOperador,
  SituacaoEntrega
} from "@padaria/shared/mensagens-admin";

/**
 * Cliente das mensagens administrativas. Concentra as rotas num lugar só para que nem o pop-up do
 * operador nem o painel do administrador montem URL à mão — foi assim que a tela de notificações
 * acabou pedindo a mesma rota duas vezes em paralelo.
 */
export function useMensagensAdmin() {
  const { apiGet, apiPost, apiPut } = useApi();

  function enviar(entrada: {
    empresaId: string;
    titulo: string;
    corpo: string;
    validoAte: string | null;
    alvos: AlvoMensagem[];
  }) {
    return apiPost<{ id: string; destinatarios: number }>("/api/mensagens-admin", entrada);
  }

  function listar(empresaId: string) {
    return apiGet<MensagemAdmin[]>(`/api/mensagens-admin?empresaId=${encodeURIComponent(empresaId)}`);
  }

  function detalhar(mensagemId: string, empresaId: string) {
    return apiGet<MensagemAdminDetalhe>(
      `/api/mensagens-admin/${mensagemId}?empresaId=${encodeURIComponent(empresaId)}`
    );
  }

  function encerrar(mensagemId: string, empresaId: string) {
    return apiPut(`/api/mensagens-admin/${mensagemId}/encerrar?empresaId=${encodeURIComponent(empresaId)}`, {});
  }

  /** A leitura É a entrega: o servidor carimba `entregue_em` nesta chamada, uma vez só. */
  function minhas(empresaId: string) {
    return apiGet<MensagemAdminDoOperador[]>(`/api/mensagens-admin/minhas?empresaId=${encodeURIComponent(empresaId)}`);
  }

  function carimbar(entregaId: string, empresaId: string, acao: "visualizar" | "confirmar" | "fechar") {
    return apiPut(`/api/mensagens-admin/entregas/${entregaId}/${acao}?empresaId=${encodeURIComponent(empresaId)}`, {});
  }

  return { enviar, listar, detalhar, encerrar, minhas, carimbar };
}

const ROTULO_SITUACAO: Record<SituacaoEntrega, string> = {
  pendente: "Não entregue",
  entregue: "Entregue",
  visualizada: "Visualizada",
  fechada: "Fechada sem confirmar",
  confirmada: "Confirmada"
};

// Cor semântica, não decoração: só `confirmada` é o fim feliz. `fechada` é âmbar porque a pessoa
// viu e dispensou — é o estado que o administrador precisa enxergar para saber quem cobrar.
const COR_SITUACAO: Record<SituacaoEntrega, string> = {
  pendente: "default",
  entregue: "info",
  visualizada: "info",
  fechada: "warning",
  confirmada: "success"
};

export function rotuloSituacao(situacao: SituacaoEntrega) {
  return ROTULO_SITUACAO[situacao];
}

export function corSituacao(situacao: SituacaoEntrega) {
  return COR_SITUACAO[situacao];
}

/**
 * Fila de mensagens do operador, com a dispensa da sessão em memória.
 *
 * "Fechar" grava `fechada_em` no servidor e some da sessão, mas a mensagem CONTINUA pendente no
 * sino até "Entendi" (R-194). Guardar as dispensadas aqui — e não no servidor — é o que faz o
 * pop-up parar de reaparecer a cada atualização sem mentir sobre quem respondeu.
 */
export function useFilaMensagensOperador() {
  const fila = ref<MensagemAdminDoOperador[]>([]);
  const dispensadas = ref(new Set<string>());

  function atual() {
    return fila.value.find((mensagem) => !dispensadas.value.has(mensagem.entregaId)) ?? null;
  }

  function definir(mensagens: MensagemAdminDoOperador[]) {
    fila.value = mensagens;
    // Entrega que saiu da fila (confirmada em outra aba) não precisa mais ocupar a dispensa.
    const vivas = new Set(mensagens.map((mensagem) => mensagem.entregaId));
    dispensadas.value = new Set([...dispensadas.value].filter((entregaId) => vivas.has(entregaId)));
  }

  function dispensar(entregaId: string) {
    dispensadas.value = new Set([...dispensadas.value, entregaId]);
  }

  function remover(entregaId: string) {
    fila.value = fila.value.filter((mensagem) => mensagem.entregaId !== entregaId);
  }

  return { fila, atual, definir, dispensar, remover };
}

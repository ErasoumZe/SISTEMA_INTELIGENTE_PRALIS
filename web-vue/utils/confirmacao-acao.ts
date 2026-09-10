import type { InjectionKey } from "vue";

// Uma unica confirmacao para atos que gravam dinheiro ou estado. Abrir/fechar uma janela e
// editar campos continuam livres: ainda nao alteram nenhum dado.
export type ConfirmarAcao = (mensagem: string, titulo?: string, textoConfirmar?: string) => Promise<boolean>;

export const CONFIRMAR_ACAO_KEY: InjectionKey<ConfirmarAcao> = Symbol("confirmar-acao");

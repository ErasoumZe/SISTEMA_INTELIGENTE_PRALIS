import type { Notificacao } from "@padaria/shared/notificacoes";

/**
 * O sino e a tela de Pendencias precisam de duas listas: o que ainda pede acao e o historico
 * completo (aberto + ja verificado). A API entrega as duas pela MESMA rota — `incluirVerificadas`
 * apenas remove o filtro `verificado = false`, entao a resposta com historico e um SUPERCONJUNTO
 * da resposta pendente, na mesma ordem (`criado_em desc`).
 *
 * Por isso a separacao e feita aqui, com UMA leitura. Antes o workspace disparava duas chamadas
 * paralelas para a mesma rota a cada troca de tela e a cada verificacao — o dobro de requisicoes
 * para um dado que ja vinha inteiro na segunda.
 */
export function separarNotificacoes(comHistorico: Notificacao[]): {
  pendentes: Notificacao[];
  historico: Notificacao[];
} {
  return {
    pendentes: comHistorico.filter((item) => !item.verificado),
    historico: comHistorico
  };
}

/** O sino e um resumo: a tela de Pendências continua disponível para consultar o histórico inteiro. */
export function limitarNotificacoesDoSino(itens: Notificacao[], limite = 5): Notificacao[] {
  return itens.slice(0, Math.max(0, limite));
}

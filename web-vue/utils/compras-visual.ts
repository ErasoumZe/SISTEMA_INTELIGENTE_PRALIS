// Linguagem visual comum de Compras. Pura: so o mapeamento de tons; a cor em si mora nos tokens --cx-*.

/** Tom da etiqueta de situacao (ComprasSituacao). Os mesmos tons em todos os modulos de Compras. */
export type TomSituacao = "neutro" | "info" | "marca" | "atencao" | "positivo" | "negativo";

/** Filtro de situacao do Estoque, ligado a faixa de numeros: no minimo, sem faixa ou todos (null). */
export type FiltroSituacaoEstoque = "minimo" | "sem_faixa" | null;

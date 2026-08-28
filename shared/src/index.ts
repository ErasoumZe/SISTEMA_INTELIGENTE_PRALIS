export * from "./app/index.js";
export * from "./admissoes/index.js";
export * from "./api/index.js";
export * from "./autenticacao/index.js";
export * from "./cadastros/index.js";
export * from "./caixa/index.js";
export * from "./areas/index.js";
export * from "./clientes/index.js";
export * from "./colaboradores/index.js";
export * from "./contas/index.js";
export * from "./empresas/index.js";
export * from "./fornecedores/index.js";
export * from "./socios-gestores/index.js";
export * from "./formas-pagamento/index.js";
export * from "./grupos/index.js";
export * from "./ids/index.js";
export * from "./datas/index.js";
export * from "./dinheiro/index.js";
export * from "./discriminacao/index.js";
export * from "./integracoes/index.js";
export * from "./patrimonio/index.js";
export * from "./pdvs/index.js";
export * from "./permissoes/index.js";
export * from "./produtos/index.js";
export * from "./recorrencia/index.js";
export * from "./setores/index.js";
export * from "./unidades-medida/index.js";
export * from "./usuarios/index.js";
export * from "./vendas/index.js";
export * from "./despesas/index.js";
export * from "./mercadorias/index.js";
export * from "./notas-fiscais/index.js";
export * from "./retiradas/index.js";
export * from "./transferencias/index.js";
export * from "./relatorios/index.js";
export * from "./saude/index.js";
export * from "./tema/index.js";
export * from "./pedidos/index.js";

/**
 * Turnos entra NOMEADO, e nao por `export *`, de proposito.
 *
 * `turnos` e `colaboradores` declaram os mesmos `diasSemana`, `diaSemanaSchema` e `DiaSemana`. Num
 * `export *` esses tres nomes virariam ambiguos e o modulo simplesmente PARARIA de exporta-los pela
 * raiz — sem erro aqui, com o erro aparecendo longe, em quem hoje os importa. Entao sobem so os
 * simbolos de etiqueta, que nao colidem; dia da semana continua vindo de colaboradores.
 *
 * Por que a raiz precisa deles: o alias do Nuxt aponta `@padaria/shared` para ESTE arquivo, e alias
 * do Vite casa por prefixo. Import de VALOR por subcaminho vira `.../index.ts/turnos` e da 404 no
 * navegador, com typecheck e lint verdes — e por isso que `scripts/verificar-arquitetura.mjs` existe.
 */
export { etiquetasTurno, type EtiquetaTurno } from "./turnos/index.js";

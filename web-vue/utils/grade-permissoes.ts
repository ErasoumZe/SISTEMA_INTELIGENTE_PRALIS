export type TelaGradePermissao = {
  rotulo: string;
  prefixo: string;
};

export type ColunaGradePermissao = {
  rotulo: string;
  nome: string;
  sufixos: readonly string[];
};

export const TELAS_GRADE_PERMISSOES = [
  { rotulo: "Despesas", prefixo: "despesas" },
  { rotulo: "Mercadorias", prefixo: "mercadorias" },
  { rotulo: "Retiradas", prefixo: "retiradas" },
  { rotulo: "Transferências", prefixo: "transferencias" },
  { rotulo: "Entradas", prefixo: "entradas" }
] as const satisfies readonly TelaGradePermissao[];

// Os sufixos seguem o catálogo de @padaria/shared. D/Pago não é alias de "valor": são as
// permissões *_dpago previstas no ciclo de vida R7/R10, mesmo quando a ação ainda é futura no
// domínio. A grade apenas edita a regra; não inventa enforcement.
export const COLUNAS_GRADE_PERMISSOES = [
  { rotulo: "Lanç", nome: "Lançar", sufixos: ["criar", "lancar"] },
  { rotulo: "Efet", nome: "Efetuar", sufixos: ["efetuar"] },
  { rotulo: "Pagar", nome: "Pagar", sufixos: ["pagar"] },
  { rotulo: "Conf", nome: "Conferir", sufixos: ["conferir"] },
  // R-231 · so Transferencias tem: dinheiro no meio do turno, sem malote e sem lacre.
  { rotulo: "S/Lacre", nome: "Transferência sem lacre", sufixos: ["sem_lacre"] },
  { rotulo: "Discr", nome: "Discriminar", sufixos: ["discriminar"] },
  { rotulo: "Ver", nome: "Visualizar", sufixos: ["visualizar"] },
  { rotulo: "Ver$", nome: "Visualizar lançamento pago (D/Pago)", sufixos: ["visualizar_dpago"] },
  { rotulo: "Edit", nome: "Editar", sufixos: ["editar"] },
  { rotulo: "Edit$", nome: "Editar lançamento pago (D/Pago)", sufixos: ["editar_dpago"] },
  { rotulo: "Excl", nome: "Excluir", sufixos: ["excluir"] },
  { rotulo: "Excl$", nome: "Excluir lançamento pago (D/Pago)", sufixos: ["excluir_dpago"] },
  { rotulo: "Aprov", nome: "Aprovar", sufixos: ["aprovar"] }
] as const satisfies readonly ColunaGradePermissao[];

/**
 * Resolve somente códigos existentes no catálogo recebido pela tela. Uma célula inexistente vira
 * `null`, portanto a grade nunca oferece uma permissão fictícia.
 */
export function montarGradePermissoes(permissoesDaTela: (tela: TelaGradePermissao) => readonly string[]) {
  return TELAS_GRADE_PERMISSOES.map((tela) => {
    const codigos = permissoesDaTela(tela);
    const celulas = COLUNAS_GRADE_PERMISSOES.map((coluna) => {
      const codigo = coluna.sufixos.map((sufixo) => `${tela.prefixo}_${sufixo}`).find((item) => codigos.includes(item));
      return { codigo: codigo ?? null };
    });
    return { tela: tela.rotulo, prefixo: tela.prefixo, celulas };
  });
}

export type RegraMenuOperacional = {
  rotulo: string;
  descricao: string;
  sufixo: "mostrar" | "desabilitado" | "somente_caixa_aberto";
};

export type ModuloMenuOperacional = {
  rotulo: string;
  prefixo: "entradas" | "transferencias" | "despesas" | "mercadorias" | "retiradas";
};

export const MODULOS_MENU_OPERACIONAL = [
  { rotulo: "Entradas", prefixo: "entradas" },
  { rotulo: "Transferências", prefixo: "transferencias" },
  { rotulo: "Despesas", prefixo: "despesas" },
  { rotulo: "Mercadorias", prefixo: "mercadorias" },
  { rotulo: "Retiradas", prefixo: "retiradas" }
] as const satisfies readonly ModuloMenuOperacional[];

export const REGRAS_MENU_OPERACIONAL = [
  {
    rotulo: "Mostrar no menu",
    descricao: "Exibe este módulo no menu lateral.",
    sufixo: "mostrar"
  },
  {
    rotulo: "Manter desabilitado",
    descricao: "Exibe o módulo, mas impede que seja aberto.",
    sufixo: "desabilitado"
  },
  {
    rotulo: "Exigir caixa aberto",
    descricao: "Só libera o módulo quando o usuário estiver com um caixa aberto.",
    sufixo: "somente_caixa_aberto"
  }
] as const satisfies readonly RegraMenuOperacional[];

export function codigoRegraMenuOperacional(modulo: ModuloMenuOperacional, regra: RegraMenuOperacional) {
  return `menu_${modulo.prefixo}_${regra.sufixo}`;
}

export function codigosMenuOperacional() {
  return MODULOS_MENU_OPERACIONAL.flatMap((modulo) =>
    REGRAS_MENU_OPERACIONAL.map((regra) => codigoRegraMenuOperacional(modulo, regra))
  );
}

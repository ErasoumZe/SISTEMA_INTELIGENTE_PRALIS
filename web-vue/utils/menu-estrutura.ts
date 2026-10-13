import {
  normalizarEstruturaMenuEmpresa,
  type EstruturaMenuEmpresa,
  type IdMenuConfiguravel
} from "@padaria/shared";
import { SECOES_MENU } from "~/utils/menu";

export type SecaoMenu = EstruturaMenuEmpresa["secoes"][number];
export type EstruturaMenu = EstruturaMenuEmpresa;

/** Sem configuração salva, o sistema preserva exatamente a organização atual. */
export function estruturaPadrao(): EstruturaMenu {
  return {
    versao: 1,
    idsOcultos: [],
    secoes: SECOES_MENU.map((secao, indice) => ({
      id: `padrao-${indice + 1}`,
      titulo: secao.titulo,
      ids: secao.ids as IdMenuConfiguravel[],
      cor: secao.cor ?? "neutro"
    }))
  };
}

/**
 * A estrutura organiza apenas itens conhecidos. Permissões continuam sendo a barreira que decide
 * o que uma pessoa vê; uma tela removida da estrutura reaparece em "Geral", nunca some.
 */
export function normalizarEstrutura(bruto: EstruturaMenu | null | undefined): EstruturaMenu | null {
  if (!bruto || bruto.versao !== 1 || !Array.isArray(bruto.secoes)) return null;
  const estrutura = normalizarEstruturaMenuEmpresa(bruto);
  return estrutura.secoes.length ? estrutura : null;
}

export function estruturaEfetiva(salva: EstruturaMenu | null | undefined): EstruturaMenu {
  return normalizarEstrutura(salva) ?? estruturaPadrao();
}

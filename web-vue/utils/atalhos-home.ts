// Quais atalhos aparecem no painel inicial — a REGRA, separada da marcacao para poder ser testada
// sem runtime Nuxt/Vuetify, no mesmo espirito do `menu.ts`.
//
// A regra-mae aqui e negativa: este modulo NAO decide quem ve o que. Ele recebe a lista que o
// AppShell ja recebeu (`telasPermitidas` filtrada pelo `usePermissoes`) e apenas a reorganiza. Se
// um dia alguem acrescentar um filtro proprio aqui, nasce uma SEGUNDA fonte de verdade sobre
// permissao, e no dia em que as duas divergirem o painel oferece atalho para tela que o usuario
// nao pode abrir. Isso e falha de acesso, nao de layout.
import type { ItemMenu } from "~/types/padaria";
import { agruparTelasMenu, type NoMenu } from "./menu";

/** Uma tela do painel, com o mesmo estado de bloqueio que o menu lateral mostra. */
export type AtalhoTela<T extends ItemMenu> = T & { desabilitada: boolean; motivo: string };

export type GrupoAtalhos<T extends ItemMenu> = { titulo: string; telas: AtalhoTela<T>[] };

/** Mesmo texto do `motivoTelaAtivaDesabilitada` do AppWorkspace, para os dois nao divergirem. */
export const MOTIVO_PADRAO = "Tela indisponivel para este perfil.";

/**
 * Categoria vira as telas de dentro dela, na mesma posicao.
 *
 * Nao e reorganizacao: categoria e so um expansor do menu, nao tem rota propria (`rotaTela`
 * devolveria `/lancamentos`, que nao existe como pagina). Um cartao para ela seria um link morto.
 * As filhas assumem o lugar dela, na ordem em que ja estavam.
 */
function telasDoNo<T extends ItemMenu>(no: NoMenu<T>): T[] {
  return no.tipo === "categoria" ? no.itens : [no];
}

/**
 * Monta os atalhos do painel a partir da MESMA lista que alimenta o menu lateral.
 *
 * Ordem e agrupamento saem de `agruparTelasMenu`, entao painel e menu nunca discordam sobre onde
 * cada tela vive. Tela desabilitada CONTINUA aparecendo, com o motivo — igual ao menu: esconder
 * num lugar e mostrar no outro ensinaria duas coisas contraditorias sobre o mesmo sistema.
 */
export function montarAtalhosHome<T extends ItemMenu>(
  telas: readonly T[],
  desabilitadas: readonly string[] = [],
  motivos: Readonly<Record<string, string>> = {}
): GrupoAtalhos<T>[] {
  const bloqueadas = new Set(desabilitadas);
  return agruparTelasMenu(telas)
    .map((grupo) => ({
      titulo: grupo.titulo,
      telas: grupo.itens.flatMap(telasDoNo).map((tela) => ({
        ...tela,
        desabilitada: bloqueadas.has(tela.id),
        motivo: motivos[tela.id] ?? MOTIVO_PADRAO
      }))
    }))
    .filter((grupo) => grupo.telas.length > 0);
}

// Quais blocos de relatorio aparecem no painel — a REGRA, separada da marcacao para ser testada
// sem runtime Nuxt/Vuetify, no mesmo espirito do `atalhos-home.ts`.
//
// A REGRA DE ACESSO, em uma frase: VOCE VE O BLOCO SE JA PODE VER O DADO POR TRAS DELE.
// Nao existe papel "diretor" no codigo — existem PERMISSOES por acao, atribuidas por cargo, setor
// ou usuario. Nenhuma permissao nova nasce aqui, e nenhuma condicao le cargo: cada bloco reusa a
// MESMA permissao que ja libera a tela ou o dado correspondente. Consequencia desejada: quem
// gerencia caixa ve o bloco de caixas; quem so opera (`caixa_operar`) nao ve.
import type { Permissao } from "@padaria/shared";

/**
 * O valor que o bloco tem para mostrar.
 * `null` significa NAO LIGADO — o painel ainda nao le esse dado. Nunca significa zero: numero
 * inventado num sistema de caixa e pior que espaco vazio, porque alguem age em cima dele.
 */
export type ValorBloco = number | null;

export type BlocoRelatorio = {
  id: "caixas_abertos" | "pendencias" | "curva_abc" | "creare";
  rotulo: string;
  /** A permissao que ja libera o dado. Nao e permissao nova. */
  permissao: Permissao;
  valor: ValorBloco;
};

export type DadosBlocos = {
  /** Caixas abertos da empresa ATIVA. `null` quando o painel nao tem a leitura. */
  caixasAbertos?: ValorBloco;
  /** Pendencias operacionais nao verificadas. `null` quando o painel nao tem a leitura. */
  pendencias?: ValorBloco;
};

/**
 * Ordem fixa, definida por Marco em 27/08: caixas, pendencias, curva ABC, Creare.
 *
 * `curva_abc` e `creare` nascem com valor `null` de proposito: ligar qualquer um dos dois exige
 * chamada nova a partir do painel, e isso e Etapa 3 (fora da frente de Design). Ate la a faixa
 * fica RESERVADA e ROTULADA, sem numero — que e o que o 69 §4 pede.
 */
export function montarBlocosRelatorio(
  temPermissao: (permissao: Permissao) => boolean,
  dados: DadosBlocos = {}
): BlocoRelatorio[] {
  const todos: BlocoRelatorio[] = [
    {
      id: "caixas_abertos",
      rotulo: "Caixas abertos",
      permissao: "caixas_gerenciar",
      valor: dados.caixasAbertos ?? null
    },
    {
      // Mesma permissao que libera a tela de Pendencias operacionais (`itemPorTela.fechamento`).
      id: "pendencias",
      rotulo: "Pendências",
      permissao: "fechamento_com_diferenca_visualizar",
      valor: dados.pendencias ?? null
    },
    {
      // Mesma permissao da tela "Produtos mais vendidos".
      id: "curva_abc",
      rotulo: "Curva ABC",
      permissao: "relatorio_produtos_visualizar",
      valor: null
    },
    {
      id: "creare",
      rotulo: "Creare",
      permissao: "integracoes_visualizar",
      valor: null
    }
  ];
  return todos.filter((bloco) => temPermissao(bloco.permissao));
}

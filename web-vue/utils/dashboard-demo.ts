/**
 * TODO O DADO FICTÍCIO DA DASHBOARD MORA AQUI. Nenhum número falso em componente.
 *
 * DECISÃO DE MARCO, 27/08/2026: a dashboard inteira é construída com dado inventado, sem ligar em
 * nada, só para apresentar — e o que cada bloco mostra se resolve quando o sistema estiver mais
 * avançado e o design já estiver na `main` junto com Caixa, Produtos e Colaboradores.
 *
 * O RISCO FOI LEVANTADO E ELE DECIDIU ASSIM, e isso fica registrado sem ser repetido: o 16 avisa
 * que número inventado num sistema de caixa faz alguém agir em cima. O que mitiga é (a) nada disto
 * ir para produção nesta fase e (b) a condição abaixo, que não é negociável porque custa zero.
 *
 * A CONDIÇÃO: um arquivo só. Quando for ligar o real, remover é UMA DELEÇÃO — não uma caçada por
 * valores espalhados em template. Componente nenhum pode ter número cravado.
 *
 * COMO SAIR DESTA FASE: quando as rotas das faixas 1 e 2 existirem (ver
 * `Planejamento/SPEC-DASHBOARD-DADOS.md`), troca-se a importação daqui pela chamada real. A forma
 * dos tipos abaixo já é a forma que a tela consome, então a troca não mexe em marcação.
 *
 * `valor: null` NÃO é o mesmo que zero, e a tela mostra travessão para `null`. Isso já existia no
 * `AppBlocosRelatorio` e continua valendo: espaço vazio é honesto, zero inventado não é.
 */
import type { Permissao } from "@padaria/shared";
import type { Categoria } from "~/utils/cores-categoria";

/** Um número numa faixa. `formato` decide como a tela escreve — não o componente. */
export type MetricaDemo = {
  id: string;
  rotulo: string;
  /** `null` = o painel ainda não lê esse dado. Sai como travessão, nunca como zero. */
  valor: number | null;
  formato: "dinheiro" | "inteiro";
  icone: string;
  /** Só o DISCO do ícone recebe cor. O número fica neutro — é a regra do card do Mobills. */
  categoria: Categoria;
  /** Para onde o "VER MAIS" do card leva. Id de tela, resolvido por `rotaTela`. */
  telaId: string;
  /**
   * VOCÊ VÊ O CARD SE JÁ PODE VER O DADO POR TRÁS DELE. Esta linha é o que o
   * `blocos-relatorio.ts` (apagado em 28/08) garantia, e ela volta aqui porque sem ela a
   * dashboard mostra estrutura financeira para quem não tem acesso — e vira vazamento de dado
   * no dia em que `dashboard-demo` for trocado pela chamada real.
   *
   * Nenhuma permissão nova nasce aqui: todas já existem em `@padaria/shared`.
   */
  permissao: Permissao;
};

/** FAIXA 1 · O dia — entradas, despesas e saldo do dia contábil corrente. */
export const FAIXA_DIA: MetricaDemo[] = [
  {
    id: "dia-entradas",
    rotulo: "Entradas",
    valor: 4872.5,
    formato: "dinheiro",
    icone: "mdi-arrow-down-circle",
    categoria: "entradas",
    telaId: "entradas",
    permissao: "entradas_visualizar"
  },
  {
    id: "dia-despesas",
    rotulo: "Despesas",
    valor: 1340.9,
    formato: "dinheiro",
    icone: "mdi-arrow-up-circle",
    categoria: "despesas",
    telaId: "despesas",
    permissao: "despesas_visualizar"
  },
  {
    id: "dia-saldo",
    rotulo: "Saldo",
    valor: 3531.6,
    formato: "dinheiro",
    icone: "mdi-scale-balance",
    categoria: "resultado",
    telaId: "fechamento",
    permissao: "fechamento_com_diferenca_visualizar"
  }
];

/** FAIXA 2 · Precisa de você — o que exige ação hoje. */
export const FAIXA_PRECISA: MetricaDemo[] = [
  {
    id: "precisa-caixas",
    rotulo: "Caixas abertos",
    valor: 2,
    formato: "inteiro",
    icone: "mdi-cash-register",
    categoria: "transferencias",
    telaId: "caixa",
    permissao: "caixas_gerenciar"
  },
  {
    id: "precisa-pendencias",
    rotulo: "Pendências",
    valor: 5,
    formato: "inteiro",
    icone: "mdi-bell-ring",
    categoria: "retiradas",
    telaId: "pendencias",
    permissao: "fechamento_com_diferenca_visualizar"
  }
];

/** FAIXA 3 · Relatórios — resumo curto que leva para a tela cheia. */
export const FAIXA_RELATORIOS: MetricaDemo[] = [
  {
    id: "rel-vendas",
    rotulo: "Vendas",
    valor: 18430,
    formato: "dinheiro",
    icone: "mdi-chart-line",
    categoria: "entradas",
    telaId: "relatorio_vendas",
    permissao: "relatorio_vendas_visualizar"
  },
  {
    id: "rel-mais-vendidos",
    rotulo: "Mais vendidos",
    valor: 12,
    formato: "inteiro",
    icone: "mdi-trophy",
    categoria: "mercadorias",
    telaId: "relatorio_produtos",
    permissao: "relatorio_produtos_visualizar"
  },
  {
    id: "rel-abc",
    rotulo: "Curva ABC",
    // Ainda não existe tela nem rota; o travessão diz isso em vez de inventar um número.
    valor: null,
    formato: "inteiro",
    icone: "mdi-sort-variant",
    categoria: "transferencias",
    telaId: "relatorio_produtos",
    permissao: "relatorio_produtos_visualizar"
  },
  {
    id: "rel-dre",
    rotulo: "DRE",
    valor: null,
    formato: "dinheiro",
    icone: "mdi-file-chart",
    categoria: "resultado",
    telaId: "relatorio_dre",
    permissao: "relatorio_produtos_visualizar"
  }
];

/**
 * FAIXA 4 · Ir para — CINCO atalhos, nesta ordem. Não 32, não por grupo, não sanfona.
 *
 * Só os ids. Título, ícone e rota saem de `itemPorTela`, e a permissão sai da lista que o menu já
 * recebe — a dashboard NÃO recalcula quem vê o quê. Segunda fonte de verdade sobre permissão é
 * como se cria divergência silenciosa.
 *
 * UMA SUBSTITUIÇÃO, registrada: o pedido lista "Lançamentos", mas `lancamentos` é CATEGORIA de
 * menu (`CATEGORIA_LANCAMENTOS`, em `utils/menu.ts`), não tela — não tem rota nem entrada em
 * `itemPorTela`. O atalho aponta para `despesas`, a primeira tela de dentro dela, e mostra o
 * título real dessa tela. Apontar um atalho para uma rota que não existe seria quebrar; inventar
 * um rótulo "Lançamentos" para uma tela chamada "Despesas" seria mentir sobre o destino.
 */
export const FAIXA_IR_PARA: readonly string[] = ["caixa", "entradas", "despesas", "contas_pagar", "relatorio_vendas"];

// FONTE ÚNICA dos hex de categoria. Antes existiam DUAS, com valores diferentes para a mesma
// categoria: os tokens `--cat-*` do main.css (que pintam cards, modais e cockpit) e o
// `corCategoriaPorTela` do tema.ts (que pinta o ícone do menu e vira a primária do Vuetify). O
// ícone de Mercadorias no menu era `#16a34a` e o card da mesma categoria era `#15803d` — dois
// verdes na mesma tela. E `despesas` não existia no tema.ts, que é o único motivo de aquele item
// do menu ficar cinza enquanto os vizinhos tinham cor.
//
// O comentário do tema.ts dizia "fonte única — não duplicar em outro lugar". Era mentira, e é o
// tipo de mentira que faz o pedido voltar pela metade. Agora é verdade, e há um teste
// (`cores-categoria.test.ts`) que lê o main.css e falha se os dois divergirem — CSS não importa TS,
// então o que torna a unicidade real é o guardião, não o comentário.
//
// Valores decididos pelo José em 01/08/2026: mais saturados, "bem vivo e evidente". Os `-soft` e
// `-strong` são derivados aritméticos da base (8% sobre branco / 20% mais escuro), não escolhas
// avulsas — assim uma base nova não exige inventar mais dois hex à mão.

export type Categoria = "entradas" | "transferencias" | "despesas" | "mercadorias" | "retiradas" | "resultado";

export type EscalaCategoria = {
  /** Cor cheia: ícone do menu, borda do card, barra superior, chip ativo. */
  base: string;
  /** ~8% da base sobre branco: fundo de card e de linha. */
  soft: string;
  /** 20% mais escura: número do card e texto que precisa segurar contraste sobre `soft`. */
  strong: string;
  /**
   * Fundo da FAIXA de cabeçalho do modal, onde o texto é BRANCO. É a única variante escolhida por
   * medição e não por fórmula: `base` reprova em 4,5:1 para entradas (2,94), transferências (3,56)
   * e mercadorias (3,30), e para entradas nem o `strong` resolve (4,40). Escurecer só quem precisa
   * mantém as outras vivas, em vez de rebaixar todas para igualar a pior.
   */
  faixa: string;
  /**
   * A categoria usada como TEXTO sobre a superfície (número calculado, chip ativo, rótulo). NÃO é a
   * `base`: medida sobre branco, a base reprova em entradas (2,94), mercadorias (3,02) e
   * transferências (3,24) — o texto colorido da tabela de discriminação nunca passou em AA.
   * Fórmula: 62% da base sobre PRETO.
   */
  tinta: string;
  /**
   * A mesma tinta no MODO ESCURO, onde escurecer piora: sobre a superfície escura a base cai para
   * 2,34 (resultado) e 3,21 (retiradas). Aqui a base CLAREIA — mesmo raciocínio do `--cx-brand-text`
   * na camada de tokens. Fórmula: 62% da base sobre BRANCO.
   */
  tintaEscura: string;
};

/**
 * Quanto da base entra no `-soft` do MODO ESCURO. No claro o soft é 8% sobre branco (um hex fixo);
 * no escuro ele é uma tinta TRANSLÚCIDA sobre o que estiver atrás, porque o mesmo token pinta faixa,
 * chip e linha de tabela — superfícies com elevações diferentes. 8% sumiria no fundo escuro.
 */
export const MISTURA_SOFT_ESCURO = 18;

export const CORES_CATEGORIA: Record<Categoria, EscalaCategoria> = {
  // contraste do branco sobre `faixa`, medido: 4,57
  entradas: {
    base: "#ca8a04",
    soft: "#fbf6eb",
    strong: "#a26e03",
    faixa: "#9e6c03",
    tinta: "#7d5602",
    tintaEscura: "#deb663"
  },
  // 4,53
  transferencias: {
    base: "#ea580c",
    soft: "#fdf2ec",
    strong: "#bb460a",
    faixa: "#cc4d0a",
    tinta: "#913707",
    tintaEscura: "#f29768"
  },
  // 4,83 — a base já passa
  despesas: {
    base: "#dc2626",
    soft: "#fceeee",
    strong: "#b01e1e",
    faixa: "#dc2626",
    tinta: "#881818",
    tintaEscura: "#e97878"
  },
  // 4,61
  mercadorias: {
    base: "#16a34a",
    soft: "#ecf8f1",
    strong: "#12823b",
    faixa: "#12873d",
    tinta: "#0e652e",
    tintaEscura: "#6fc68f"
  },
  // 5,17 — a base já passa
  retiradas: {
    base: "#2563eb",
    soft: "#eef3fd",
    strong: "#1e4fbc",
    faixa: "#2563eb",
    tinta: "#173d92",
    tintaEscura: "#789ef3"
  },
  // 7,10 — a base já passa
  resultado: {
    base: "#6d28d9",
    soft: "#f3eefc",
    strong: "#5720ae",
    faixa: "#6d28d9",
    tinta: "#441987",
    tintaEscura: "#a47ae7"
  }
};

/**
 * Qual categoria pinta cada TELA. Existe separado de `CORES_CATEGORIA` porque a relação não é 1:1:
 * `relatorio_vendas` divide a cor de `entradas`, e as telas de cadastro/configuração não têm
 * categoria nenhuma — ficam sem cor de propósito (ver o hover neutro do menu, no 67).
 */
export const CATEGORIA_POR_TELA: Record<string, Categoria> = {
  entradas: "entradas",
  relatorio_vendas: "entradas",
  transferencias: "transferencias",
  despesas: "despesas",
  mercadorias: "mercadorias",
  retiradas: "retiradas"
};

export function corDaCategoria(categoria: Categoria): string {
  return CORES_CATEGORIA[categoria].base;
}

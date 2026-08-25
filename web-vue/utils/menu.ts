// Agrupamento apenas VISUAL do menu lateral (nao filtra nem altera permissoes) — extraido do
// AppShell.vue para ser testavel sem runtime Nuxt/Vuetify. Quem decide o que o usuario ve e o
// usePermissoes (telasPermitidas); aqui so se decide em que secao cada tela cai.
import type { ItemMenu } from "~/types/padaria";

// Categoria de menu: uma entrada UNICA que guarda telas dentro dela (PROJECT_BRAIN/17, D6). A
// categoria e so navegacao — cada tela continua com a sua listagem separada por categoria.
export type CategoriaMenu = { id: string; titulo: string; icone: string; ids: readonly string[] };

// "Lancamentos" SUBSTITUI os tres itens soltos (Despesas / Mercadorias / Retiradas) no menu: eles
// deixam de existir na raiz e passam a viver DENTRO desta categoria. A visibilidade continua sendo
// a de cada tela — cargo sem nenhuma das tres (ou Caixa com o caixa fechado) nao ve a categoria.
export const CATEGORIA_LANCAMENTOS: CategoriaMenu = {
  id: "lancamentos",
  titulo: "Lançamentos",
  icone: "mdi-format-list-checks",
  ids: ["despesas", "mercadorias", "retiradas"]
};

export const CATEGORIAS_MENU: CategoriaMenu[] = [CATEGORIA_LANCAMENTOS];

const categoriaPorId = new Map(CATEGORIAS_MENU.map((categoria) => [categoria.id, categoria] as const));

// Um no do menu: ou uma tela (folha, vira link) ou uma categoria (abre/fecha e revela as telas).
export type NoMenu<T extends ItemMenu> =
  | ({ tipo: "tela" } & T)
  | { tipo: "categoria"; id: string; titulo: string; icone: string; itens: T[] };

export type GrupoMenu<T extends ItemMenu> = { titulo: string; itens: NoMenu<T>[] };

// Grupos do menu na nomenclatura do Xmind V2 (PROJECT_BRAIN/10): as grandes categorias viram
// Entradas / Transferencias / Saidas / Resultados / Configuracao. Isto e SO o esqueleto de grupos
// (o menu montado por SETOR e trabalho posterior); aqui cada tela existente cai no seu eixo. Os
// titulos seguem a convencao ASCII do resto do codigo (dominio em portugues sem acento).
// Um id pode ser o de uma TELA ou o de uma CATEGORIA (CATEGORIAS_MENU).
export const SECOES_MENU: { titulo: string; ids: string[] }[] = [
  {
    // Entradas – Vendas / Faturamento: o caixa (onde a venda entra) + o historico + a tela de entradas.
    titulo: "Entradas",
    ids: ["caixa", "historico_caixas", "entradas"]
  },
  {
    // Transferencias – Contas / Locais: cofre <-> caixa, o lacre do movimento e o plano de contas.
    titulo: "Transferencias",
    ids: ["transferencias", "contas"]
  },
  {
    // Saidas – Lancamentos (Despesas / Mercadorias / Retiradas, agrupadas na categoria) + estoque e a pagar.
    titulo: "Saidas",
    ids: [CATEGORIA_LANCAMENTOS.id, "contas_pagar", "pedidos", "perdas_sobras", "estoque_produtos"]
  },
  {
    // Resultados – Relatorios + Diferenca de fechamento.
    titulo: "Resultados",
    ids: [
      "fechamento",
      "relatorio_vendas",
      "relatorio_produtos",
      "relatorio_dre",
      "relatorio_faltas",
      "relatorio_advertencias",
      "relatorio_fiscal"
    ]
  },
  {
    // Configuracao – Cadastros / Gerais (tudo que e cadastro, admin e formularios/avaliacoes).
    titulo: "Configuração",
    ids: [
      "produtos",
      "grupos",
      "unidades",
      "turnos",
      "formas_pagamento",
      "fornecedores",
      "clientes",
      "colaboradores",
      "admissoes_testes",
      "folha_ponto",
      "avaliacao_qualidade",
      "avaliacao_colaboradores",
      "promocoes",
      "ficha_tecnica",
      "ingredientes",
      "fiscal_produtos",
      "patrimonio",
      "notas_fiscais",
      "pdv",
      "areas_setores",
      "empresas",
      "usuarios",
      "permissoes",
      "integracoes",
      "aparencia"
    ]
  }
];

function noTela<T extends ItemMenu>(tela: T): NoMenu<T> {
  return { ...tela, tipo: "tela" };
}

// Cada tela permitida cai na sua secao; o que nao estiver mapeado vai para "Geral", garantindo que
// nenhuma tela desapareca do menu. Telas de uma categoria saem da raiz e entram dentro dela.
export function agruparTelasMenu<T extends ItemMenu>(telas: readonly T[]): GrupoMenu<T>[] {
  const restantes = new Map(telas.map((tela) => [tela.id, tela] as const));
  const grupos: GrupoMenu<T>[] = [];
  for (const secao of SECOES_MENU) {
    const itens: NoMenu<T>[] = [];
    for (const id of secao.ids) {
      const categoria = categoriaPorId.get(id);
      if (categoria) {
        const filhos: T[] = [];
        for (const filhoId of categoria.ids) {
          const tela = restantes.get(filhoId);
          if (tela) {
            filhos.push(tela);
            restantes.delete(filhoId);
          }
        }
        // Categoria vazia nao aparece: sem nenhuma tela liberada nao existe o que agrupar.
        if (filhos.length) {
          itens.push({
            tipo: "categoria",
            id: categoria.id,
            titulo: categoria.titulo,
            icone: categoria.icone,
            itens: filhos
          });
        }
        continue;
      }
      const tela = restantes.get(id);
      if (tela) {
        itens.push(noTela(tela));
        restantes.delete(id);
      }
    }
    if (itens.length) grupos.push({ titulo: secao.titulo, itens });
  }
  const outras = [...restantes.values()].map(noTela);
  if (outras.length) grupos.push({ titulo: "Geral", itens: outras });
  return grupos;
}

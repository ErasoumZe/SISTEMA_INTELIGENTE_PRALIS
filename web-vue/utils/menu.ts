// Agrupamento apenas VISUAL do menu lateral (nao filtra nem altera permissoes) — extraido do
// AppShell.vue para ser testavel sem runtime Nuxt/Vuetify. Quem decide o que o usuario ve e o
// usePermissoes (telasPermitidas); aqui so se decide em que secao cada tela cai.
import { idsFilhosLancamentos, type CorMenuGrupo, type CorRgbMenu } from "@padaria/shared";
import type { ItemMenu } from "~/types/padaria";

// Categoria de menu: uma entrada UNICA que guarda telas dentro dela (PROJECT_BRAIN/17, D6). A
// categoria e so navegacao — cada tela continua com a sua listagem separada por categoria.
export type CategoriaMenu = { id: string; titulo: string; icone: string; ids: readonly string[] };

// "Lancamentos" agrupa as saidas financeiras que nao sao do fluxo operacional de Compras.
// deixam de existir na raiz e passam a viver DENTRO desta categoria. A visibilidade continua sendo
// a de cada tela — cargo sem nenhuma das tres (ou Caixa com o caixa fechado) nao ve a categoria.
export const CATEGORIA_LANCAMENTOS: CategoriaMenu = {
  id: "lancamentos",
  titulo: "Lançamentos",
  icone: "mdi-format-list-checks",
  ids: idsFilhosLancamentos
};

export const CATEGORIAS_MENU: CategoriaMenu[] = [CATEGORIA_LANCAMENTOS];

const categoriaPorId = new Map(CATEGORIAS_MENU.map((categoria) => [categoria.id, categoria] as const));

// Um no do menu: ou uma tela (folha, vira link) ou uma categoria (abre/fecha e revela as telas).
export type NoMenu<T extends ItemMenu> =
  | ({ tipo: "tela" } & T)
  | { tipo: "categoria"; id: string; titulo: string; icone: string; itens: T[] };

export type GrupoMenu<T extends ItemMenu> = {
  titulo: string;
  cor?: CorMenuGrupo;
  corRgb?: CorRgbMenu;
  itens: NoMenu<T>[];
};

// Grupos do menu na nomenclatura do Xmind V2 (PROJECT_BRAIN/10): as grandes categorias viram
// Entradas / Transferencias / Saidas / Resultados / Configuracao. Isto e SO o esqueleto de grupos
// (o menu montado por SETOR e trabalho posterior); aqui cada tela existente cai no seu eixo. Os
// titulos seguem a convencao ASCII do resto do codigo (dominio em portugues sem acento).
// Um id pode ser o de uma TELA ou o de uma CATEGORIA (CATEGORIAS_MENU).
export const SECOES_MENU: { titulo: string; ids: string[]; cor?: CorMenuGrupo; corRgb?: CorRgbMenu }[] = [
  {
    // Entradas – Vendas / Faturamento: o caixa (onde a venda entra) + o historico + a tela de entradas.
    titulo: "Entradas",
    cor: "entradas",
    ids: ["caixa", "historico_caixas", "entradas", "campanhas"]
  },
  {
    // Transferencias – Contas / Locais: cofre <-> caixa, o lacre do movimento e o plano de contas.
    titulo: "Transferencias",
    cor: "transferencias",
    ids: ["transferencias", "contas"]
  },
  {
    // Saidas financeiras fora do fluxo de Compras.
    titulo: "Saidas",
    cor: "neutro",
    ids: [CATEGORIA_LANCAMENTOS.id, "contas_pagar", "perdas_sobras"]
  },
  {
    // R-215: compras fisicas ficam aqui; Mercadorias/NF-e permanece no fluxo financeiro de Lancamentos.
    titulo: "Compras",
    ids: [
      "estoque_produtos",
      "conferencias_estoque",
      "agendamento_pedidos",
      "solicitacao_compra",
      "pedidos",
      "pedidos_finalizados",
      "cadastro_compras",
      "fornecedores"
    ]
  },
  {
    // Resultados – Relatorios + Diferenca de fechamento.
    titulo: "Resultados",
    cor: "resultado",
    ids: [
      "fechamento",
      "relatorio_fechamento",
      "relatorio_vendas",
      "relatorio_produtos",
      "relatorio_dre",
      "relatorio_fiscal"
    ]
  },
  {
    // Departamento pessoal e um eixo proprio: nao faz parte de Configuracao.
    titulo: "Departamento pessoal",
    ids: [
      "departamento_pessoal",
      "admissoes_processos",
      "admissoes_testes",
      "conplus_folha_05",
      "conplus_adiantamento_20",
      "conplus_rescisoes",
      "conplus_ferias",
      "conplus_exportar",
      "colaboradores",
      "funcoes_operacionais",
      "areas_setores",
      "turnos",
      "folha_ponto",
      "relatorio_faltas",
      "relatorio_advertencias",
      "avaliacao_qualidade",
      "avaliacao_colaboradores"
    ]
  },
  {
    // Configuracao – Cadastros / Gerais (tudo que e cadastro, admin e formularios/avaliacoes).
    titulo: "Configuração",
    ids: [
      "produtos",
      "maquininhas",
      "grupos",
      "unidades",
      "formas_pagamento",
      "socios_gestores",
      "clientes",
      "promocoes",
      "ficha_tecnica",
      "ingredientes",
      "fiscal_produtos",
      "patrimonio",
      "notas_fiscais",
      "pdv",
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
//
// A ESTRUTURA VIRA PARAMETRO, com o `SECOES_MENU` como padrao. Ela deixou de ser constante para o
// administrador poder reorganizar o menu sem alteracao de codigo — e o default e o que torna a
// migracao segura: quem nao passa nada continua com o menu de sempre, byte a byte.
//
// O QUE NAO MUDA, e e o ponto: as telas que chegam aqui JA PASSARAM pelo filtro de permissao. A
// estrutura so ORGANIZA o que a permissao liberou; ela nao mostra tela que o usuario nao pode ver,
// porque tela sem permissao nunca chega nesta lista. A rede do "Geral" tambem continua valendo, e
// agora vale sobre a estrutura salva em vez de sobre a constante.
export function agruparTelasMenu<T extends ItemMenu>(
  telas: readonly T[],
  estrutura: readonly {
    titulo: string;
    ids: readonly string[];
    cor?: CorMenuGrupo;
    corRgb?: CorRgbMenu;
  }[] = SECOES_MENU,
  idsOcultos: readonly string[] = []
): GrupoMenu<T>[] {
  const ocultos = new Set(idsOcultos);
  const restantes = new Map(telas.filter((tela) => !ocultos.has(tela.id)).map((tela) => [tela.id, tela] as const));
  const grupos: GrupoMenu<T>[] = [];
  for (const secao of estrutura) {
    const itens: NoMenu<T>[] = [];
    for (const id of secao.ids) {
      const categoria = categoriaPorId.get(id);
      if (categoria) {
        if (ocultos.has(categoria.id)) {
          for (const filhoId of categoria.ids) restantes.delete(filhoId);
          continue;
        }
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
    if (itens.length) grupos.push({ titulo: secao.titulo, cor: secao.cor, corRgb: secao.corRgb, itens });
  }
  const outras = [...restantes.values()].map(noTela);
  if (outras.length) grupos.push({ titulo: "Geral", itens: outras });
  return grupos;
}

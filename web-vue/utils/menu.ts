// Agrupamento apenas VISUAL do menu lateral (nao filtra nem altera permissoes) — extraido do
// AppShell.vue para ser testavel sem runtime Nuxt/Vuetify. Quem decide o que o usuario ve e o
// usePermissoes (telasPermitidas); aqui so se decide em que secao cada tela cai.
import type { ItemMenu } from "~/types/padaria";

// Grupos do menu na nomenclatura do Xmind V2 (PROJECT_BRAIN/10): as grandes categorias viram
// Entradas / Transferencias / Saidas / Resultados / Configuracao. Isto e SO o esqueleto de grupos
// (o menu montado por SETOR e trabalho posterior); aqui cada tela existente cai no seu eixo. Os
// titulos seguem a convencao ASCII do resto do codigo (dominio em portugues sem acento).
export const SECOES_MENU: { titulo: string; ids: string[] }[] = [
  {
    // Entradas – Vendas / Faturamento: o caixa (onde a venda entra) + o historico + a tela de entradas.
    titulo: "Entradas",
    ids: ["caixa", "historico_caixas", "entradas"]
  },
  {
    // Transferencias – Contas / Locais: cofre <-> caixa, malote/lacre e o plano de contas (eixo laranja).
    titulo: "Transferencias",
    ids: ["transferencias", "malotes", "contas"]
  },
  {
    // Saidas – Despesas / Custos + Mercadorias / CMV + Retiradas / Investimentos (+ estoque e a pagar).
    titulo: "Saidas",
    ids: ["despesas", "mercadorias", "retiradas", "contas_pagar", "pedidos", "perdas_sobras", "estoque_produtos"]
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
    titulo: "Configuracao",
    ids: [
      "produtos",
      "grupos",
      "unidades",
      "turnos",
      "formas_pagamento",
      "fornecedores",
      "clientes",
      "colaboradores",
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

// Cada tela permitida cai na sua secao; o que nao estiver mapeado vai para "Geral", garantindo que
// nenhuma tela desapareca do menu.
export function agruparTelasMenu<T extends ItemMenu>(telas: readonly T[]) {
  const restantes = new Map(telas.map((tela) => [tela.id, tela] as const));
  const grupos: { titulo: string; itens: T[] }[] = [];
  for (const secao of SECOES_MENU) {
    const itens: T[] = [];
    for (const id of secao.ids) {
      const tela = restantes.get(id);
      if (tela) {
        itens.push(tela);
        restantes.delete(id);
      }
    }
    if (itens.length) grupos.push({ titulo: secao.titulo, itens });
  }
  const outras = [...restantes.values()];
  if (outras.length) grupos.push({ titulo: "Geral", itens: outras });
  return grupos;
}

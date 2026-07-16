// Agrupamento apenas VISUAL do menu lateral (nao filtra nem altera permissoes) — extraido do
// AppShell.vue para ser testavel sem runtime Nuxt/Vuetify. Quem decide o que o usuario ve e o
// usePermissoes (telasPermitidas); aqui so se decide em que secao cada tela cai.
import type { ItemMenu } from "~/types/padaria";

export const SECOES_MENU: { titulo: string; ids: string[] }[] = [
  {
    titulo: "Operacao",
    ids: [
      "caixa",
      "historico_caixas",
      "entradas",
      "despesas",
      "retiradas",
      "transferencias",
      "mercadorias",
      "fechamento",
      "pedidos"
    ]
  },
  {
    titulo: "Relatorios",
    ids: [
      "relatorio_vendas",
      "relatorio_produtos",
      "contas_pagar",
      "relatorio_dre",
      "relatorio_faltas",
      "relatorio_advertencias",
      "relatorio_fiscal"
    ]
  },
  {
    titulo: "Cadastros",
    ids: [
      "produtos",
      "grupos",
      "unidades",
      "turnos",
      "formas_pagamento",
      "fornecedores",
      "clientes",
      "colaboradores",
      "pdv",
      "malotes",
      "areas_setores",
      "ficha_tecnica",
      "ingredientes",
      "fiscal_produtos",
      "patrimonio",
      "notas_fiscais"
    ]
  },
  {
    titulo: "Administracao",
    ids: ["empresas", "contas", "usuarios", "permissoes", "integracoes", "aparencia"]
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

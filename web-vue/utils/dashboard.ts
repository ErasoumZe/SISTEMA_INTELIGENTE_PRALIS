// A REGRA da dashboard. Fica aqui, fora do componente, para ser testável sem runtime Nuxt/Vuetify —
// mesmo espírito do `menu.ts` e do `sanfona-menu.ts`.
//
// ESTE MÓDULO NÃO DECIDE QUEM VÊ O QUÊ. Ele reorganiza a lista que já chegou filtrada, e filtra os
// cards pela permissão que cada um declara. Se alguém acrescentar aqui um filtro próprio — "se for
// diretor mostra tudo" —, nasce uma SEGUNDA fonte de verdade sobre permissão, e um dia ela diverge
// da do menu. Foi exatamente isso que o `atalhos-home.ts` (apagado em 28/08) protegia, e a regra
// volta com ele.
import type { Permissao } from "@padaria/shared";
import type { ItemMenu } from "~/types/padaria";
import type { MetricaDemo } from "~/utils/dashboard-demo";
import { itemPorTela } from "~/utils/domain";

/** O mesmo texto que o `AppWorkspace` usa quando não há motivo específico. Uma fonte só. */
export const MOTIVO_PADRAO = "Tela indisponivel para este perfil.";

export type AtalhoPainel = ItemMenu & { desabilitada: boolean; motivo: string };

/**
 * VOCÊ VÊ O CARD SE JÁ PODE VER O DADO POR TRÁS DELE.
 *
 * Sem isto, a dashboard mostra "Entradas", "Saldo" e "Vendas" para qualquer um que faça login.
 * Enquanto o dado é fictício isso é vazamento de estrutura; no dia em que `dashboard-demo` for
 * trocado pela chamada real, vira vazamento de dado financeiro — que é o defeito que os oito casos
 * de permissão do `blocos-relatorio.test.ts` existiam para impedir.
 *
 * Faixa que fica sem nenhum card não deve aparecer, nem o título dela. Quem chama decide isso pelo
 * tamanho da lista devolvida.
 */
export function metricasPermitidas(
  metricas: readonly MetricaDemo[],
  temPermissao: (permissao: Permissao) => boolean
): MetricaDemo[] {
  return metricas.filter((metrica) => temPermissao(metrica.permissao));
}

/**
 * Os atalhos da FAIXA 4, na ordem pedida, com o MESMO estado que o menu lateral mostra.
 *
 * A ARMADILHA QUE ISTO EVITA, e ela era um defeito ativo antes: `telasMenu` significa "aparece no
 * menu", NÃO "pode abrir". O `telaDesabilitadaNoMenu` (domain.ts:366) devolve `true` para quem tem
 * `menu_X_desabilitado` ou para quem depende de caixa aberto com o caixa fechado — e essas telas
 * CONTINUAM na lista. Filtrar só por `telas` produzia uma pílula clicável para uma tela que o menu
 * ao lado mostra cinza, com tooltip explicando que está bloqueada.
 *
 * A tela bloqueada não some: ela aparece marcada, com o motivo, igual ao menu. O painel não pode
 * ensinar uma coisa e o menu outra.
 */
export function atalhosDoPainel(
  ids: readonly string[],
  telas: readonly ItemMenu[],
  desabilitadas: readonly string[] = [],
  motivos: Readonly<Record<string, string>> = {}
): AtalhoPainel[] {
  const visiveis = new Set(telas.map((tela) => tela.id));
  const bloqueadas = new Set(desabilitadas);
  const atalhos: AtalhoPainel[] = [];
  for (const id of ids) {
    if (!visiveis.has(id)) continue;
    const item = itemPorTela[id];
    if (!item) continue;
    atalhos.push({ ...item, desabilitada: bloqueadas.has(id), motivo: motivos[id] ?? MOTIVO_PADRAO });
  }
  return atalhos;
}

// A REGRA da sanfona dos grupos do menu (VIS-E7c). Fica aqui, fora do componente, pelo mesmo motivo
// que o `agruparTelasMenu` ficou: e logica, da para testar sem runtime Nuxt/Vuetify, e o AppSidebar
// nao precisa crescer para guardar decisao.
//
// NAO decide o que aparece no menu — isso continua sendo `usePermissoes` + `agruparTelasMenu`. Aqui
// so se decide o que nasce ABERTO.
import type { ItemMenu } from "~/types/padaria";
import type { GrupoMenu } from "~/utils/menu";

/**
 * Id do painel que o `aria-controls` do gatilho aponta. O titulo do grupo e texto de tela e vem com
 * acento e espaco ("Configuração"), que nao servem como id: `aria-controls` casa por id literal e um
 * caractere fora do ASCII ali e pedir para um leitor de tela nao achar o painel.
 *
 * Decompoe e remove os diacriticos em vez de tabelar substituicoes — assim um grupo novo com "ç",
 * "ã" ou hifen funciona sem ninguem lembrar de vir aqui.
 *
 * O PREFIXO existe porque o menu e a home renderizam os MESMOS titulos ao mesmo tempo no Painel:
 * os dois saem de `agruparTelasMenu`. Sem prefixo os dois lados gerariam o mesmo id, e
 * `aria-controls` casa por id literal — o leitor de tela acharia o painel errado, ou nenhum.
 */
export function idDoGrupo(titulo: string, prefixo = "sidebar"): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefixo}-grupo-${base || "sem-nome"}`;
}

/**
 * O titulo do grupo que contem a tela ativa, ou `null` se nenhum contiver.
 *
 * Olha DENTRO das categorias (Lancamentos) tambem: quem esta em /despesas esta no grupo "Saidas",
 * mesmo a tela nao estando solta na raiz dele. Sem isso, o grupo da tela ativa nasceria fechado
 * justamente para quem usa lancamentos.
 */
export function grupoDaTela<T extends ItemMenu>(grupos: GrupoMenu<T>[], telaAtiva: string): string | null {
  for (const grupo of grupos) {
    for (const no of grupo.itens) {
      if (no.tipo === "categoria") {
        if (no.itens.some((tela) => tela.id === telaAtiva)) return grupo.titulo;
        continue;
      }
      if (no.id === telaAtiva) return grupo.titulo;
    }
  }
  return null;
}

/**
 * O estado inicial da sanfona.
 *
 * A REGRA E UMA SO: grupo que o estado ainda nao conhece nasce ABERTO; o que o usuario fechou
 * continua fechado; e o grupo da tela ativa e sempre forcado a aberto.
 *
 * Isso resolve tres casos sem nenhuma excecao escrita a mao:
 *
 * 1. PRIMEIRO USO — todos abertos, que e exatamente o menu de hoje. A sanfona ACRESCENTA a
 *    possibilidade de recolher; ela nao esconde 33 itens de quem nunca pediu isso. Uma versao
 *    anterior deste arquivo abria so o grupo da tela ativa, e a medicao mostrou o preco: quem entra
 *    cai no Painel, que nao e tela de menu, e o menu inteiro nascia recolhido.
 * 2. GRUPO NOVO — se uma permissao nova faz aparecer um grupo que nao existia, ele nasce aberto.
 *    Esconder o que acabou de ser liberado seria o oposto do que a pessoa espera.
 * 3. TELA ATIVA — o grupo dela nunca fica fechado. Se ficasse, os tres sinais do item ativo que o
 *    67 §9 exige (fundo, peso, barra lateral) sumiriam junto, e o menu deixaria de responder
 *    "onde estou".
 *
 * NAO e acordeao exclusivo: varios grupos podem ficar abertos ao mesmo tempo. Sao 5 ou 6 grupos e o
 * uso real cruza entre eles (Entradas -> Resultados); fechar o que a pessoa abriu para abrir outro
 * e hostil.
 *
 * Nunca se escreve `false` por cima de um `true` que o usuario pos — mesma disciplina do watch da
 * categoria "Lancamentos", que so escreve `true`.
 */
export function gruposIniciais<T extends ItemMenu>(
  grupos: GrupoMenu<T>[],
  telaAtiva: string,
  atual: Record<string, boolean> = {}
): Record<string, boolean> {
  const proximo: Record<string, boolean> = { ...atual };
  const daTela = grupoDaTela(grupos, telaAtiva);
  for (const grupo of grupos) {
    if (proximo[grupo.titulo] === undefined) proximo[grupo.titulo] = grupo.titulo === daTela;
  }
  if (daTela) proximo[daTela] = true;
  return proximo;
}

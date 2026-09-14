// A ESTRUTURA DO MENU COMO DADO, e não como constante.
//
// Hoje a organização do menu vive em `SECOES_MENU` (`utils/menu.ts`), em código. Para o
// administrador poder reorganizar sem pedir alteração de código, ela precisa virar dado — e esse
// dado precisa de uma porta de entrada que NÃO confie no que chega.
//
// O QUE ESTE ARQUIVO NÃO FAZ, e é o mais importante: ele não decide quem vê o quê. A permissão
// continua sendo a autoridade final, aplicada DEPOIS, pelo `usePermissoes` — a estrutura só diz em
// que seção cada tela cai, e só entre as telas que a permissão já liberou. Uma tela colocada numa
// seção por configuração continua invisível para quem não tem acesso a ela.
import { SECOES_MENU } from "~/utils/menu";

/** Uma seção do menu: um título e a lista de ids que moram nela (tela ou categoria). */
export type SecaoMenu = { titulo: string; ids: string[] };

/** A estrutura inteira, na ordem em que as seções aparecem. */
export type EstruturaMenu = SecaoMenu[];

/**
 * O PADRÃO DE FÁBRICA é o `SECOES_MENU` de hoje, e é isso que torna a migração segura: sem
 * configuração salva, o menu se comporta exatamente como sempre se comportou. Nenhum usuário
 * precisa configurar nada para o sistema continuar funcionando.
 */
export function estruturaPadrao(): EstruturaMenu {
  return SECOES_MENU.map((secao) => ({ titulo: secao.titulo, ids: [...secao.ids] }));
}

/**
 * A PORTA DE ENTRADA. Recebe o que veio de fora — banco, API, storage — e devolve uma estrutura
 * confiável, ou `null` quando não há nada aproveitável.
 *
 * `null` é resposta legítima e não erro: quem chama cai no padrão de fábrica. É a regra 5 —
 * "nada quebra se a configuração estiver ausente ou corrompida" —, e ela vale para os dois casos,
 * porque do ponto de vista da tela "não existe" e "veio quebrado" pedem a mesma reação.
 *
 * O QUE ELA DESCARTA, item a item, em vez de rejeitar o conjunto: seção sem título utilizável,
 * seção sem nenhum id, id que não é texto, e id REPETIDO em mais de uma seção. O último é o que
 * mais importa: sem essa poda a mesma tela apareceria duas vezes no menu, e o agrupador — que
 * remove a tela da lista assim que a coloca — mostraria a primeira e engoliria a segunda em
 * silêncio. Melhor podar aqui, onde dá para explicar, do que deixar sumir lá.
 *
 * Uma estrutura que sobra vazia depois da poda também devolve `null`: menu sem nenhuma seção não é
 * configuração, é ausência dela.
 */
export function normalizarEstrutura(bruto: EstruturaMenu | null | undefined): EstruturaMenu | null {
  if (!Array.isArray(bruto)) return null;

  const jaUsados = new Set<string>();
  const limpa: EstruturaMenu = [];

  for (const secao of bruto) {
    if (!secao || typeof secao !== "object" || Array.isArray(secao)) continue;
    const titulo = typeof secao.titulo === "string" ? secao.titulo.trim() : "";
    if (!titulo) continue;
    if (!Array.isArray(secao.ids)) continue;

    const ids: string[] = [];
    for (const id of secao.ids) {
      if (typeof id !== "string") continue;
      const limpo = id.trim();
      if (!limpo || jaUsados.has(limpo)) continue;
      jaUsados.add(limpo);
      ids.push(limpo);
    }
    // Seção sem nenhum id é ruído: ela nunca apareceria (categoria vazia não aparece, regra 4) e
    // ainda ocuparia espaço na configuração salva.
    if (ids.length) limpa.push({ titulo, ids });
  }

  return limpa.length ? limpa : null;
}

/**
 * O que a tela de configuração salva, e o que o menu lê. Guardar `null` é o mesmo que não ter
 * configuração — e é assim que "remover tudo" volta ao padrão de fábrica sem caso especial.
 */
export function estruturaEfetiva(salva: EstruturaMenu | null | undefined): EstruturaMenu {
  return normalizarEstrutura(salva) ?? estruturaPadrao();
}

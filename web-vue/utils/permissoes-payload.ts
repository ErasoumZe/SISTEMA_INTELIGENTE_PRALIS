// S-06 — a tela de Permissoes esconde 39 permissoes (as 13 telas de `telasOcultasNoDrawerEPermissoes`
// e as flags `menu_*` delas). A listagem reescreve o `regrasJson` so com as visiveis
// (`useCadastroView.ts:305-317`), o form nasce desse JSON (`AppWorkspace.vue:1412`) e o save manda o
// form inteiro. Como o servidor faz REPLACE total (`api/src/permissoes/permissoes.repository.ts:52-86`),
// tudo que a tela escondeu era APAGADO — o cargo Gerencia perdia 12 permissoes a cada gravacao.
//
// POR QUE A CORRECAO E AQUI E NAO NO SERVIDOR: o replace total e intencional e tem dois donos que
// dependem dele. O `restaurarPadraoCargo` existe explicitamente para substituir
// (`permissoes.service.ts:196-198`, "REPLACE, nao merge") e a lista de referencia so produz `true`
// (`db/src/referencia-permissoes.ts:105-107`), entao sob merge ele nunca mais removeria nada. E o
// terceiro estado da propria tela — "herdar" — e codificado como AUSENCIA de chave
// (`useCadastroView.ts:350`), o mesmo encoding das ocultas: um merge no servidor tornaria "herdar"
// inoperante. O contrato Zod nao distingue "remover" de "nao mencionado"
// (`shared/src/permissoes/index.ts:10`, `partialRecord`), entao o servidor nao tem como desambiguar.
//
// A fonte da preservacao e o proprio `regrasJson` que o servidor mandou para AQUELE alvo
// (`permissoes.service.ts:86`) — devolver ao banco o que o banco acabou de enviar. E idempotente e
// nao concede nada novo: o que o alvo nao tinha continua nao tendo.
import { permissoesOcultasNaTela } from "./domain";
import type { Permissao } from "@padaria/shared";

/** Linha de permissao como a API entrega, ANTES de a listagem filtrar as ocultas. */
export type LinhaPermissaoPersistida = {
  id?: string | undefined;
  regrasJson?: string | undefined;
};

/** So o que o merge precisa do formulario — mantem a funcao pura e testavel sem montar o modal. */
export type AlvoPermissaoDoForm = {
  tipoPermissao: "cargo" | "setor" | "usuario";
  cargoId: string;
  setorId: string;
  usuarioId: string;
  regras: Record<string, boolean>;
};

/**
 * Chave do alvo no mesmo formato do `id` que a API devolve — `cargo:<uuid>` / `setor:<uuid>` /
 * `usuario:<id>` (`api/src/permissoes/permissoes.service.ts:98,115,132`).
 *
 * Deriva do ALVO CORRENTE DO FORM, nao da linha que foi aberta. Isso e o que impede a troca de alvo
 * no modal (os selects seguem editaveis em edicao, `WorkspaceDialogs.vue:779-810`) de carregar as
 * ocultas do cargo anterior para o novo. Tambem e o que faz o caminho "Novo"
 * (`AppWorkspace.vue:1387-1392`) preservar as ocultas do alvo escolhido.
 */
export function chaveAlvoPermissao(form: AlvoPermissaoDoForm): string {
  const alvoId =
    form.tipoPermissao === "cargo" ? form.cargoId : form.tipoPermissao === "setor" ? form.setorId : form.usuarioId;
  return alvoId ? `${form.tipoPermissao}:${alvoId}` : "";
}

/** Mesmo parse tolerante da listagem (`useCadastroView.ts:292-299`): so entradas booleanas entram. */
function regrasBooleanasDoJson(regrasJson: string | undefined): Record<string, boolean> {
  try {
    const regras = JSON.parse(regrasJson ?? "{}") as Record<string, boolean>;
    return Object.fromEntries(Object.entries(regras).filter(([, valor]) => typeof valor === "boolean"));
  } catch {
    return {};
  }
}

/**
 * Regras a enviar no save da tela de Permissoes: as OCULTAS que o alvo ja tinha gravadas, mais tudo
 * o que esta no formulario. O form vence em caso de conflito — se um dia uma permissao hoje oculta
 * for revelada, quem manda passa a ser a tela, sem precisar mexer aqui.
 *
 * Preserva apenas o que EXISTE no banco para aquele alvo: permissao oculta ausente continua ausente
 * (nao e concessao automatica), e o valor gravado e respeitado inclusive quando e `false` (negar).
 */
export function regrasComOcultasPreservadas(
  form: AlvoPermissaoDoForm,
  linhasPersistidas: readonly LinhaPermissaoPersistida[]
): Record<string, boolean> {
  const chave = chaveAlvoPermissao(form);
  if (!chave) return { ...form.regras };

  const persistidas = linhasPersistidas.find((linha) => linha.id === chave);
  if (!persistidas) return { ...form.regras };

  const ocultasDoAlvo = Object.entries(regrasBooleanasDoJson(persistidas.regrasJson)).filter(([permissao]) =>
    permissoesOcultasNaTela.has(permissao as Permissao)
  );

  return { ...Object.fromEntries(ocultasDoAlvo), ...form.regras };
}

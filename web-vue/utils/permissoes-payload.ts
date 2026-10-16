// S-06 — a tela de Permissoes esconde 48 permissoes do formulario (`permissoesOcultasNaTela`), o
// servidor faz REPLACE total (`permissoes.repository.ts`) e o que a tela nao manda ele apaga.
//
// A correcao e no cliente porque o replace e intencional e tem dois donos: `restaurarPadraoCargo`
// existe para substituir, e o estado "herdar" da propria tela e codificado como AUSENCIA de chave.
// Um merge no servidor mataria os dois, e o contrato Zod nao distingue "remover" de "nao
// mencionado". Ver `PROJECT_BRAIN/23_PERMISSOES_MODELO_E_AUDITORIA.md` (P-03).
import { permissoesOcultasNaTela } from "./domain";
import type { Permissao } from "@padaria/shared";
import type { CadastroForm, Opcoes } from "~/types/padaria";

/** So o que o merge precisa do form — amarrado ao tipo real para o typecheck pegar renomeacao. */
export type AlvoPermissaoDoForm = Pick<CadastroForm, "tipoPermissao" | "cargoId" | "setorId" | "usuarioId" | "regras">;

/**
 * Listas COMPLETAS de regras ja gravadas, como `/api/permissoes` devolve. Sao a fonte certa por
 * nao serem paginadas nem filtradas: `permissoesPagina` traz uma pagina de 10 e nasce vazia ate o
 * usuario clicar em Buscar, entao o caminho "Novo" nao encontraria o alvo e cairia no payload
 * mutilado — a S-06 de volta, em silencio.
 */
export type ListasPermissoesPersistidas = Pick<Opcoes, "cargosPermissoes" | "setoresPermissoes" | "usuariosPermissoes">;

/** Alvo de uma operacao de permissao — o mesmo discriminante que o payload usa. */
export type AlvoPermissao = Pick<AlvoPermissaoDoForm, "tipoPermissao" | "cargoId" | "setorId" | "usuarioId">;

/** Qual lista e qual chave de id correspondem ao tipo do alvo. */
function listaDoAlvo(alvo: AlvoPermissao): { chave: keyof ListasPermissoesPersistidas; campo: string; id: string } {
  if (alvo.tipoPermissao === "setor") return { chave: "setoresPermissoes", campo: "setorId", id: alvo.setorId };
  if (alvo.tipoPermissao === "usuario") return { chave: "usuariosPermissoes", campo: "usuarioId", id: alvo.usuarioId };
  return { chave: "cargosPermissoes", campo: "cargoId", id: alvo.cargoId };
}

/**
 * Devolve as listas com as regras do alvo atualizadas — upsert por id, sem tocar nos vizinhos.
 *
 * Existe porque `opcoes` (fonte das ocultas no save) so e populado ao carregar a tela, e as
 * permissoes mudam por caminhos que nao passam pelo formulario: o "Restaurar padrao" faz REPLACE
 * incluindo as ocultas, e o proprio save grava um conjunto novo. Sem sincronizar, o save seguinte
 * na mesma sessao reinjeta o retrato ANTIGO e desfaz a restauracao em silencio.
 *
 * Nao faz chamada de rede: o restaurar-padrao ja devolve `{ cargoId, regras }` no corpo, e o save
 * ja conhece o payload que enviou. Nunca busca em `/api/permissoes/regras`, que e paginada,
 * filtrada e nao serve de fonte.
 */
export function aplicarRegrasDoAlvoNasListas(
  listas: ListasPermissoesPersistidas,
  alvo: AlvoPermissao,
  regras: Record<string, boolean>
): ListasPermissoesPersistidas {
  const { chave, campo, id } = listaDoAlvo(alvo);
  // Alvo sem id: nao ha o que casar, e inventar uma entrada criaria alvo fantasma.
  if (!id) return listas;

  const atual = listas[chave];
  const existe = atual.some((item) => item[campo as "cargoId"] === id);
  const proxima = existe
    ? atual.map((item) => (item[campo as "cargoId"] === id ? { ...item, regras } : item))
    : [...atual, { id, [campo]: id, regras }];

  return { ...listas, [chave]: proxima };
}

/** Regras hoje gravadas para o alvo escolhido NO FORM, ou `{}` se ele ainda nao tem nenhuma. */
export function regrasGravadasDoAlvo(
  form: AlvoPermissaoDoForm,
  listas: ListasPermissoesPersistidas
): Record<string, boolean> {
  const encontrada =
    form.tipoPermissao === "cargo"
      ? form.cargoId && listas.cargosPermissoes.find((item) => item.cargoId === form.cargoId)
      : form.tipoPermissao === "setor"
        ? form.setorId && listas.setoresPermissoes.find((item) => item.setorId === form.setorId)
        : form.usuarioId && listas.usuariosPermissoes.find((item) => item.usuarioId === form.usuarioId);

  if (!encontrada || typeof encontrada !== "object") return {};
  return Object.fromEntries(Object.entries(encontrada.regras ?? {}).filter(([, valor]) => typeof valor === "boolean"));
}

/**
 * Regras a enviar no save da tela de Permissoes: as OCULTAS que o alvo ja tinha gravadas, mais tudo
 * o que esta no formulario. O form vence no conflito — se uma tela hoje oculta for revelada, quem
 * manda passa a ser a tela, sem mexer aqui.
 *
 * Le o alvo CORRENTE do form, nao a linha que foi aberta: os selects de cargo/setor/usuario seguem
 * editaveis em edicao, e sem isso trocar o alvo no modal levaria as ocultas do anterior para o novo.
 *
 * Preserva so o que EXISTE no banco — permissao oculta ausente continua ausente (nao ha concessao
 * automatica) e o valor gravado e respeitado inclusive quando e `false` (negar). O filtro por
 * `permissoesOcultasNaTela` tambem impede que uma chave legada do banco, fora do catalogo atual,
 * vaze para o payload e seja recusada pelo enum do Zod.
 */
export function regrasComOcultasPreservadas(
  form: AlvoPermissaoDoForm,
  listas: ListasPermissoesPersistidas
): Record<string, boolean> {
  const ocultasDoAlvo = Object.entries(regrasGravadasDoAlvo(form, listas)).filter(([permissao]) =>
    permissoesOcultasNaTela.has(permissao as Permissao)
  );

  return { ...Object.fromEntries(ocultasDoAlvo), ...form.regras };
}

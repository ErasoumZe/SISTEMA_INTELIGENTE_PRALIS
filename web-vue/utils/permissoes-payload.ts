// S-06 — a tela de Permissoes esconde 52 permissoes do formulario (`permissoesOcultasNaTela`), o
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

/** Regras hoje gravadas para o alvo escolhido NO FORM, ou `{}` se ele ainda nao tem nenhuma. */
function regrasGravadasDoAlvo(form: AlvoPermissaoDoForm, listas: ListasPermissoesPersistidas): Record<string, boolean> {
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

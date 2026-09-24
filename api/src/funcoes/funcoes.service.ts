import type { DadosExternos } from "@padaria/shared/api";
import { funcaoOperacionalPayloadSchema } from "@padaria/shared/funcoes";
import { conflito, naoEncontrado } from "../erros.js";
import { listarFuncoesOperacionaisRepository, salvarFuncaoOperacionalRepository } from "./funcoes.repository.js";

/**
 * O catalogo de funcoes operacionais.
 *
 * Tres atos, e so tres: listar, criar e editar. **Nao existe excluir** — nem aqui, nem no
 * repositorio, nem no controller. Uma funcao sai de circulacao com `ativo = false` e volta com
 * `ativo = true`; o registro que ja apontava para ela continua valido e legivel.
 *
 * A recusa de exclusao NAO e um 409 desta camada, porque nao ha caminho ate ele: a rota nao existe.
 * Quem tenta apagar por SQL direto recebe `23503` das duas chaves estrangeiras compostas que
 * apontam para ca. A garantia e a ausencia do caminho, e nao uma mensagem de erro.
 */

export async function listarFuncoesOperacionais(escopoDados: string[]) {
  if (!escopoDados.length) return [];
  return listarFuncoesOperacionaisRepository(escopoDados);
}

/**
 * Nome repetido na mesma empresa.
 *
 * Comparacao pelo CODIGO do erro e pelo NOME da constraint, nunca pelo texto: a mensagem do
 * Postgres muda entre versoes e locales. E a causa aninhada importa — o driver embrulha o erro
 * dentro de `cause` quando ele passa pelo Drizzle. Mesma forma do `TURNO_EM_USO`.
 */
const constraintNomeUnico = "funcoes_operacionais_empresa_nome_unica";

function ehNomeRepetido(erro: Error): boolean {
  const candidatos = [erro, erro.cause instanceof Error ? erro.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    return detalhes.code === "23505" && detalhes.constraint === constraintNomeUnico;
  });
}

export async function salvarFuncaoOperacional(id: string | null, body: DadosExternos) {
  const dados = funcaoOperacionalPayloadSchema.parse(body);

  try {
    const salva = await salvarFuncaoOperacionalRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      // Aparado antes de gravar: o unique compara o nome CRU, entao " PADEIRO" e "PADEIRO"
      // conviveriam no catalogo e o DP veria a mesma funcao duas vezes.
      nome: dados.nome.trim(),
      ativo: dados.ativo,
      // Repassa AUSENTE como ausente — trocar por `?? null` aqui apagaria o CBO de toda funcao
      // salva por um cliente que nao conhece o campo.
      ...(dados.cbo === undefined ? {} : { cbo: dados.cbo })
    });

    // Nulo na edicao significa "nao existe NESTA empresa" — a unica coisa que o chamador pode saber.
    // Mesma resposta para inexistente e para alheia: distinguir entregaria a existencia de graca.
    if (!salva) throw naoEncontrado("Funcao operacional nao encontrada");
    return salva;
  } catch (erro) {
    if (erro instanceof Error && ehNomeRepetido(erro)) {
      throw conflito("Já existe uma função com este nome nesta empresa.", "FUNCAO_DUPLICADA");
    }
    throw erro;
  }
}

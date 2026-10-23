import { ERROS_QUESTOR, verificarCodigosNoCatalogoQuestor, type TabelaCodigoQuestor } from "@padaria/shared/conplus";
import { codigoPostgresDoErro, conflito, ErroDominio, naoProcessavel, type ErroEncadeado } from "../erros.js";
import { buscarCodigosQuestorRepository } from "./questor-configuracao.repository.js";

/** 42P01 tabela inexistente · 42703 coluna inexistente: as migrations Questor (0064+) não estão no banco. */
const SINAIS_MIGRATION_PENDENTE = new Set(["42P01", "42703"]);

export function ehMigrationQuestorPendente(erro: ErroEncadeado): boolean {
  return SINAIS_MIGRATION_PENDENTE.has(codigoPostgresDoErro(erro) ?? "");
}

/**
 * Executa a operação e, se o banco ainda não tem as migrations Questor, responde 503 com código
 * próprio em vez de 500 genérico — a tela sabe esconder a funcionalidade, e ninguém culpa o dado.
 */
export async function comMigrationQuestor<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (ehMigrationQuestorPendente(erro as ErroEncadeado)) {
      throw new ErroDominio(
        "Integração Questor indisponível: as migrations Questor (0064 em diante) ainda não foram aplicadas neste banco",
        503,
        ERROS_QUESTOR.migrationPendente
      );
    }
    throw erro;
  }
}

export function versaoQuestorDesatualizada() {
  return conflito(
    "Os dados foram alterados por outra pessoa. Recarregue e tente de novo.",
    ERROS_QUESTOR.versaoDesatualizada
  );
}

type ReferenciaCodigo = { tabela: TabelaCodigoQuestor; codigo: string | null | undefined; caminho: string };

/**
 * Em TODA gravação, todo código referenciado precisa existir e estar ATIVO no catálogo da mesma
 * empresa — inclusive o que já estava gravado. Consequência deliberada: se um código for
 * desativado, o registro que o usa só volta a ser gravado com outro código ativo.
 */
export async function exigirCodigosAtivosNoCatalogo(
  empresaId: string,
  referencias: readonly ReferenciaCodigo[]
): Promise<void> {
  const escolhidas = referencias.filter((referencia) => referencia.codigo);
  if (escolhidas.length === 0) return;
  const catalogo = await buscarCodigosQuestorRepository(
    empresaId,
    escolhidas.map((referencia) => referencia.codigo!)
  );
  const erros = verificarCodigosNoCatalogoQuestor(catalogo, escolhidas);
  if (erros.length > 0) {
    throw naoProcessavel("Código Questor fora do catálogo ativo da empresa", ERROS_QUESTOR.codigoForaDoCatalogo, erros);
  }
}

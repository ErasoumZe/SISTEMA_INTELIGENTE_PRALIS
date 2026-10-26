import { and, asc, eq, inArray } from "drizzle-orm";
import {
  perfisUsuarios,
  questorCodigos as questorCodigosTabela,
  questorConfiguracoes as questorConfiguracoesTabela
} from "@padaria/db/schema";
import type { CodigoQuestorPayload, ConfiguracaoQuestorPayload, TabelaCodigoQuestor } from "@padaria/shared/conplus";
import { banco } from "../banco/conexao.js";

/** E2 — configuração e catálogo. Toda consulta filtra por `empresa_id` do ator. */

const colunasConfiguracao = {
  versao: questorConfiguracoesTabela.versao,
  codigoEstabelecimento: questorConfiguracoesTabela.codigoEstabelecimento,
  classificacaoOrganograma: questorConfiguracoesTabela.classificacaoOrganograma,
  utilizaHoraCentesimal: questorConfiguracoesTabela.utilizaHoraCentesimal,
  codigoEmpresaQuestor: questorConfiguracoesTabela.codigoEmpresaQuestor,
  razaoSocialQuestor: questorConfiguracoesTabela.razaoSocialQuestor,
  padroes: questorConfiguracoesTabela.padroes,
  atualizadoEm: questorConfiguracoesTabela.atualizadoEm
};

export type ConfiguracaoQuestorLinha = {
  versao: number;
  codigoEstabelecimento: number | null;
  classificacaoOrganograma: string | null;
  utilizaHoraCentesimal: boolean | null;
  codigoEmpresaQuestor: number | null;
  razaoSocialQuestor: string | null;
  padroes: Record<string, string>;
  atualizadoEm: Date;
  atualizadoPorNome: string | null;
};

type DadosConfiguracao = Omit<ConfiguracaoQuestorPayload, "versao">;

export async function obterConfiguracaoQuestorRepository(empresaId: string): Promise<ConfiguracaoQuestorLinha | null> {
  const [linha] = await banco
    .select({ ...colunasConfiguracao, atualizadoPorNome: perfisUsuarios.nome })
    .from(questorConfiguracoesTabela)
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, questorConfiguracoesTabela.atualizadoPor))
    .where(eq(questorConfiguracoesTabela.empresaId, empresaId))
    .limit(1);
  return linha ?? null;
}

/** `null` = outra requisição criou a configuração antes (UNIQUE por empresa). */
export async function inserirConfiguracaoQuestorRepository(
  empresaId: string,
  dados: DadosConfiguracao,
  usuarioId: string
) {
  const [linha] = await banco
    .insert(questorConfiguracoesTabela)
    .values({ empresaId, ...dados, versao: 1, atualizadoPor: usuarioId })
    .onConflictDoNothing()
    .returning({ versao: questorConfiguracoesTabela.versao });
  return linha ?? null;
}

/** `null` = a versão lida não é mais a gravada (ou a configuração não existe). */
export async function atualizarConfiguracaoQuestorRepository(
  empresaId: string,
  versaoLida: number,
  dados: DadosConfiguracao,
  usuarioId: string
) {
  const [linha] = await banco
    .update(questorConfiguracoesTabela)
    .set({ ...dados, versao: versaoLida + 1, atualizadoPor: usuarioId })
    .where(and(eq(questorConfiguracoesTabela.empresaId, empresaId), eq(questorConfiguracoesTabela.versao, versaoLida)))
    .returning({ versao: questorConfiguracoesTabela.versao });
  return linha ?? null;
}

const colunasCodigo = {
  id: questorCodigosTabela.id,
  tabela: questorCodigosTabela.tabela,
  codigo: questorCodigosTabela.codigo,
  descricao: questorCodigosTabela.descricao,
  ativo: questorCodigosTabela.ativo,
  atualizadoEm: questorCodigosTabela.atualizadoEm
};

export async function listarCodigosQuestorRepository(
  empresaId: string,
  filtro: { tabela?: TabelaCodigoQuestor | undefined; incluirInativos: boolean }
) {
  const condicoes = [eq(questorCodigosTabela.empresaId, empresaId)];
  if (filtro.tabela) condicoes.push(eq(questorCodigosTabela.tabela, filtro.tabela));
  if (!filtro.incluirInativos) condicoes.push(eq(questorCodigosTabela.ativo, true));
  return banco
    .select(colunasCodigo)
    .from(questorCodigosTabela)
    .where(and(...condicoes))
    .orderBy(asc(questorCodigosTabela.tabela), asc(questorCodigosTabela.codigo));
}

/** `null` = o código já existe nesta tabela da empresa. */
export async function inserirCodigoQuestorRepository(
  empresaId: string,
  dados: CodigoQuestorPayload,
  usuarioId: string
) {
  const [linha] = await banco
    .insert(questorCodigosTabela)
    .values({ empresaId, ...dados, criadoPor: usuarioId })
    .onConflictDoNothing()
    .returning(colunasCodigo);
  return linha ?? null;
}

/** Só descrição e situação: tabela e código são imutáveis. `null` = não existe nesta empresa. */
export async function atualizarCodigoQuestorRepository(
  empresaId: string,
  id: string,
  dados: { descricao?: string | undefined; ativo?: boolean | undefined }
) {
  const [linha] = await banco
    .update(questorCodigosTabela)
    .set(dados)
    .where(and(eq(questorCodigosTabela.id, id), eq(questorCodigosTabela.empresaId, empresaId)))
    .returning(colunasCodigo);
  return linha ?? null;
}

/** Itens do catálogo DESTA empresa com os códigos pedidos — para checar existência e situação. */
export async function buscarCodigosQuestorRepository(empresaId: string, codigos: readonly string[]) {
  if (codigos.length === 0) return [];
  return banco
    .select({
      tabela: questorCodigosTabela.tabela,
      codigo: questorCodigosTabela.codigo,
      ativo: questorCodigosTabela.ativo
    })
    .from(questorCodigosTabela)
    .where(and(eq(questorCodigosTabela.empresaId, empresaId), inArray(questorCodigosTabela.codigo, [...codigos])));
}

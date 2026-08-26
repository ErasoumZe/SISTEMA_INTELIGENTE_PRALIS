import { and, asc, count, desc, eq, gte, ilike, inArray, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { admissoesFuncoes, admissoesTestes, admissoesTestesHistorico } from "@padaria/db/schema/admissoes";
// `cargos` NAO entra aqui. Ele e catalogo de ACESSO (chave de `permissoes_cargos`); a funcao
// operacional vive em `admissoes_funcoes`. O import ausente e a primeira barreira contra a
// mistura voltar por conveniencia.
import { colaboradores, perfisUsuarios } from "@padaria/db/schema/cadastro";
import type {
  AcaoHistoricoTeste,
  MotivoCancelamento,
  ResultadoTeste,
  StatusTeste,
  TestesQuery
} from "@padaria/shared/admissoes";
import type { PaginationQuery, ResultadoPaginado } from "@padaria/shared/api";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

// Aliases porque a MESMA tabela de perfis responde por quatro papeis na mesma linha. Sem alias o
// drizzle junta tudo num join so e os quatro nomes viram o mesmo valor.
const perfilCriador = alias(perfisUsuarios, "perfil_criador");
const perfilAtualizador = alias(perfisUsuarios, "perfil_atualizador");
const perfilEncerrador = alias(perfisUsuarios, "perfil_encerrador");
const perfilCancelador = alias(perfisUsuarios, "perfil_cancelador");
const perfilAtor = alias(perfisUsuarios, "perfil_ator");

export type TesteLinha = {
  id: string;
  nomeCompleto: string;
  funcaoId: string;
  funcaoNome: string;
  funcaoCbo: string | null;
  jornadaHorario: string;
  inicioEm: Date;
  fimCombinadoEm: Date;
  status: StatusTeste;
  resultado: ResultadoTeste | null;
  versao: number;
};

export type TesteDetalheLinha = TesteLinha & {
  motivoCancelamento: MotivoCancelamento | null;
  criadoPorNome: string | null;
  criadoEm: Date;
  atualizadoPorNome: string | null;
  atualizadoEm: Date;
  encerradoPorNome: string | null;
  encerradoEm: Date | null;
  canceladoPorNome: string | null;
  canceladoEm: Date | null;
};

// `%` e `_` do termo digitado sao literais para quem busca, nao curingas. Sem escapar, digitar "%"
// devolve a lista inteira. Nao ha risco de injecao (o drizzle manda o padrao como parametro), e sim
// de resultado que o operador nao pediu.
function padraoBusca(termo: string) {
  return `%${termo.replace(/[\\%_]/gu, (caractere) => `\\${caractere}`)}%`;
}

// A janela do dia de negocio chega PRONTA do service (shared/datas). O repositorio nao calcula fuso:
// misturar regra de calendario com montagem de consulta foi o que produziu o bug de dia contabil.
export async function listarTestesRepository(
  empresaId: string,
  query: TestesQuery,
  statusDaSituacao: StatusTeste[],
  janelaHoje: { inicio: Date; fim: Date }
): Promise<ResultadoPaginado<TesteLinha>> {
  const filtros: SQL[] = [eq(admissoesTestes.empresaId, empresaId)];

  if (query.buscaNome) filtros.push(ilike(admissoesTestes.nomeCompleto, padraoBusca(query.buscaNome)));
  if (query.situacao) filtros.push(inArray(admissoesTestes.status, statusDaSituacao));
  if (query.funcaoId) filtros.push(eq(admissoesTestes.funcaoId, query.funcaoId));
  // Prazo so existe para teste em andamento — encerrado/cancelado nao vence.
  if (query.prazo) {
    filtros.push(eq(admissoesTestes.status, "em_teste"));
    if (query.prazo === "vence_hoje") {
      filtros.push(gte(admissoesTestes.fimCombinadoEm, janelaHoje.inicio));
      filtros.push(lt(admissoesTestes.fimCombinadoEm, janelaHoje.fim));
    } else {
      filtros.push(lt(admissoesTestes.fimCombinadoEm, janelaHoje.inicio));
    }
  }

  const where = and(...filtros);
  const [{ total } = { total: 0 }] = await banco.select({ total: count() }).from(admissoesTestes).where(where);

  // Join com `admissoes_funcoes` casando TAMBEM a empresa: e a mesma defesa em profundidade da FK
  // composta. Funcao de outra empresa nao existe aqui, mas o join nao depende disso para estar certo.
  const itens = await banco
    .select({
      id: admissoesTestes.id,
      nomeCompleto: admissoesTestes.nomeCompleto,
      funcaoId: admissoesTestes.funcaoId,
      funcaoNome: admissoesFuncoes.nome,
      funcaoCbo: admissoesFuncoes.cbo,
      jornadaHorario: admissoesTestes.jornadaHorario,
      inicioEm: admissoesTestes.inicioEm,
      fimCombinadoEm: admissoesTestes.fimCombinadoEm,
      status: admissoesTestes.status,
      resultado: admissoesTestes.resultado,
      versao: admissoesTestes.versao
    })
    .from(admissoesTestes)
    .innerJoin(
      admissoesFuncoes,
      and(
        eq(admissoesFuncoes.id, admissoesTestes.funcaoId),
        eq(admissoesFuncoes.empresaId, admissoesTestes.empresaId)
      )
    )
    .where(where)
    // `id` como desempate: sem ele, dois testes com o mesmo fim trocam de lugar entre paginas e o
    // operador ve a mesma linha duas vezes.
    .orderBy(asc(admissoesTestes.fimCombinadoEm), asc(admissoesTestes.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { itens, total, page: query.page, pageSize: query.pageSize };
}

export async function obterTesteRepository(id: string, empresaId: string): Promise<TesteDetalheLinha | null> {
  const [linha] = await banco
    .select({
      id: admissoesTestes.id,
      nomeCompleto: admissoesTestes.nomeCompleto,
      funcaoId: admissoesTestes.funcaoId,
      funcaoNome: admissoesFuncoes.nome,
      funcaoCbo: admissoesFuncoes.cbo,
      jornadaHorario: admissoesTestes.jornadaHorario,
      inicioEm: admissoesTestes.inicioEm,
      fimCombinadoEm: admissoesTestes.fimCombinadoEm,
      status: admissoesTestes.status,
      resultado: admissoesTestes.resultado,
      versao: admissoesTestes.versao,
      motivoCancelamento: admissoesTestes.motivoCancelamento,
      // SO o nome. E-mail nunca entra na projecao: e identificador reaproveitavel em outras rotas.
      criadoPorNome: perfilCriador.nome,
      criadoEm: admissoesTestes.criadoEm,
      atualizadoPorNome: perfilAtualizador.nome,
      atualizadoEm: admissoesTestes.atualizadoEm,
      encerradoPorNome: perfilEncerrador.nome,
      encerradoEm: admissoesTestes.encerradoEm,
      canceladoPorNome: perfilCancelador.nome,
      canceladoEm: admissoesTestes.canceladoEm
    })
    .from(admissoesTestes)
    .innerJoin(
      admissoesFuncoes,
      and(
        eq(admissoesFuncoes.id, admissoesTestes.funcaoId),
        eq(admissoesFuncoes.empresaId, admissoesTestes.empresaId)
      )
    )
    .leftJoin(perfilCriador, eq(perfilCriador.usuarioId, admissoesTestes.criadoPor))
    .leftJoin(perfilAtualizador, eq(perfilAtualizador.usuarioId, admissoesTestes.atualizadoPor))
    .leftJoin(perfilEncerrador, eq(perfilEncerrador.usuarioId, admissoesTestes.encerradoPor))
    .leftJoin(perfilCancelador, eq(perfilCancelador.usuarioId, admissoesTestes.canceladoPor))
    // A empresa entra no proprio WHERE: "nao existe" e "e de outra empresa" produzem a MESMA
    // resposta vazia, entao a rota nao vira oraculo sobre pessoa de outro tenant.
    .where(and(eq(admissoesTestes.id, id), eq(admissoesTestes.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

// Portao unico de TODA escrita com um teste no path. Trava a linha ANTES de qualquer validacao de
// payload — validar primeiro faria a mensagem de erro virar oraculo de existencia.
export async function bloquearTesteRepository(id: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: admissoesTestes.id,
      empresaId: admissoesTestes.empresaId,
      status: admissoesTestes.status,
      versao: admissoesTestes.versao,
      cpf: admissoesTestes.cpf,
      nomeCompleto: admissoesTestes.nomeCompleto,
      funcaoId: admissoesTestes.funcaoId,
      jornadaHorario: admissoesTestes.jornadaHorario,
      inicioEm: admissoesTestes.inicioEm,
      fimCombinadoEm: admissoesTestes.fimCombinadoEm
    })
    .from(admissoesTestes)
    .where(and(eq(admissoesTestes.id, id), eq(admissoesTestes.empresaId, empresaId)))
    .limit(1)
    // `no key update` e nao `update`: o INSERT no historico toma FOR KEY SHARE implicito na linha
    // pai pela verificacao de FK, e FOR KEY SHARE conflita com FOR UPDATE.
    .for("no key update");
  return linha ?? null;
}

/**
 * A funcao existe nesta empresa? Devolve tambem a SITUACAO dela.
 *
 * Devolve a linha, e nao um booleano, porque "nao existe" e "existe mas esta inativa" sao recusas
 * diferentes: a primeira e erro de referencia, a segunda e regra de catalogo — e so a segunda pode
 * ser aceita quando o teste ja apontava para aquela funcao antes de ela ser desativada.
 */
export async function obterFuncaoDaEmpresaRepository(funcaoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: admissoesFuncoes.id, ativo: admissoesFuncoes.ativo })
    .from(admissoesFuncoes)
    .where(and(eq(admissoesFuncoes.id, funcaoId), eq(admissoesFuncoes.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** Existe OUTRO teste em andamento com este CPF na empresa? `ignorarId` exclui o proprio alvo. */
export async function existeTesteAbertoPorCpfRepository(
  input: { empresaId: string; cpf: string; ignorarId?: string },
  db: TransacaoBanco
) {
  const filtros: SQL[] = [
    eq(admissoesTestes.empresaId, input.empresaId),
    eq(admissoesTestes.cpf, input.cpf),
    eq(admissoesTestes.status, "em_teste")
  ];
  const linhas = await db
    .select({ id: admissoesTestes.id })
    .from(admissoesTestes)
    .where(and(...filtros))
    .limit(2);
  return linhas.some((linha) => linha.id !== input.ignorarId);
}

/** Booleano puro. NAO devolve id, nome nem vinculo — so o fato de existir alguem com esse CPF. */
export async function existeColaboradorPorCpfRepository(empresaId: string, cpf: string) {
  const [linha] = await banco
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(and(eq(colaboradores.empresaId, empresaId), eq(colaboradores.cpf, cpf)))
    .limit(1);
  return Boolean(linha);
}

export async function existeTesteAbertoPorCpfSemTransacaoRepository(empresaId: string, cpf: string) {
  const [linha] = await banco
    .select({ id: admissoesTestes.id })
    .from(admissoesTestes)
    .where(
      and(
        eq(admissoesTestes.empresaId, empresaId),
        eq(admissoesTestes.cpf, cpf),
        eq(admissoesTestes.status, "em_teste")
      )
    )
    .limit(1);
  return Boolean(linha);
}

export async function criarTesteRepository(
  input: {
    empresaId: string;
    nomeCompleto: string;
    cpf: string;
    funcaoId: string;
    jornadaHorario: string;
    inicioEm: Date;
    fimCombinadoEm: Date;
    atorUsuarioId: string;
  },
  db: TransacaoBanco
) {
  // `onConflictDoNothing` cobre a corrida que a pre-checagem nao cobre: duas criacoes simultaneas do
  // mesmo CPF passam pelas duas verificacoes e chegam aqui. O indice unico PARCIAL
  // (empresa_id, cpf) WHERE status='em_teste' recusa a segunda, e o service traduz para 409.
  const [linha] = await db
    .insert(admissoesTestes)
    .values({
      empresaId: input.empresaId,
      nomeCompleto: input.nomeCompleto,
      cpf: input.cpf,
      funcaoId: input.funcaoId,
      jornadaHorario: input.jornadaHorario,
      inicioEm: input.inicioEm,
      fimCombinadoEm: input.fimCombinadoEm,
      criadoPor: input.atorUsuarioId,
      atualizadoPor: input.atorUsuarioId
    })
    .onConflictDoNothing()
    .returning({ id: admissoesTestes.id, versao: admissoesTestes.versao });
  return linha ?? null;
}

export async function atualizarTesteRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    nomeCompleto: string;
    cpf: string;
    funcaoId: string;
    jornadaHorario: string;
    inicioEm: Date;
    fimCombinadoEm: Date;
    atorUsuarioId: string;
  },
  db: TransacaoBanco
) {
  // A versao entra no WHERE, e nao so no if do service: se duas transacoes passarem pela mesma
  // leitura, a segunda nao encontra linha e o service responde conflito em vez de sobrescrever.
  const [linha] = await db
    .update(admissoesTestes)
    .set({
      nomeCompleto: input.nomeCompleto,
      cpf: input.cpf,
      funcaoId: input.funcaoId,
      jornadaHorario: input.jornadaHorario,
      inicioEm: input.inicioEm,
      fimCombinadoEm: input.fimCombinadoEm,
      atualizadoPor: input.atorUsuarioId,
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesTestes.id, input.id),
        eq(admissoesTestes.empresaId, input.empresaId),
        eq(admissoesTestes.versao, input.versaoAtual),
        eq(admissoesTestes.status, "em_teste")
      )
    )
    .returning({ versao: admissoesTestes.versao });
  return linha ?? null;
}

export async function encerrarTesteRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    resultado: ResultadoTeste;
    atorUsuarioId: string;
    encerradoEm: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesTestes)
    .set({
      status: "encerrado",
      resultado: input.resultado,
      encerradoPor: input.atorUsuarioId,
      encerradoEm: input.encerradoEm,
      atualizadoPor: input.atorUsuarioId,
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesTestes.id, input.id),
        eq(admissoesTestes.empresaId, input.empresaId),
        eq(admissoesTestes.versao, input.versaoAtual),
        eq(admissoesTestes.status, "em_teste")
      )
    )
    .returning({ versao: admissoesTestes.versao });
  return linha ?? null;
}

export async function cancelarTesteRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    motivoCancelamento: MotivoCancelamento;
    atorUsuarioId: string;
    canceladoEm: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesTestes)
    .set({
      status: "cancelado",
      motivoCancelamento: input.motivoCancelamento,
      canceladoPor: input.atorUsuarioId,
      canceladoEm: input.canceladoEm,
      atualizadoPor: input.atorUsuarioId,
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesTestes.id, input.id),
        eq(admissoesTestes.empresaId, input.empresaId),
        eq(admissoesTestes.versao, input.versaoAtual),
        eq(admissoesTestes.status, "em_teste")
      )
    )
    .returning({ versao: admissoesTestes.versao });
  return linha ?? null;
}

/** CPF nunca sai por listagem nem por join: e uma leitura propria, e quem chama grava o evento. */
export async function obterCpfDoTesteRepository(id: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ cpf: admissoesTestes.cpf, versao: admissoesTestes.versao })
    .from(admissoesTestes)
    .where(and(eq(admissoesTestes.id, id), eq(admissoesTestes.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

// `camposAlterados` recebe NOMES de campos. Nunca valores: gravar antes/depois duplicaria a PII
// dentro da propria auditoria, que e o oposto do que ela existe para fazer.
export async function registrarEventoRepository(
  input: {
    testeId: string;
    empresaId: string;
    versao: number;
    acao: AcaoHistoricoTeste;
    atorUsuarioId: string;
    camposAlterados?: string[];
  },
  db: TransacaoBanco
) {
  await db.insert(admissoesTestesHistorico).values({
    testeId: input.testeId,
    empresaId: input.empresaId,
    versao: input.versao,
    acao: input.acao,
    atorUsuarioId: input.atorUsuarioId,
    camposAlterados: input.camposAlterados ?? []
  });
}

export async function listarHistoricoRepository(
  testeId: string,
  empresaId: string,
  query: PaginationQuery
): Promise<ResultadoPaginado<{
  id: string;
  versao: number;
  acao: AcaoHistoricoTeste;
  atorNome: string | null;
  camposAlterados: string[];
  ocorridoEm: Date;
}>> {
  const where = and(eq(admissoesTestesHistorico.testeId, testeId), eq(admissoesTestesHistorico.empresaId, empresaId));
  const [{ total } = { total: 0 }] = await banco
    .select({ total: count() })
    .from(admissoesTestesHistorico)
    .where(where);
  const itens = await banco
    .select({
      id: admissoesTestesHistorico.id,
      versao: admissoesTestesHistorico.versao,
      acao: admissoesTestesHistorico.acao,
      atorNome: perfilAtor.nome,
      camposAlterados: admissoesTestesHistorico.camposAlterados,
      ocorridoEm: admissoesTestesHistorico.ocorridoEm
    })
    .from(admissoesTestesHistorico)
    .leftJoin(perfilAtor, eq(perfilAtor.usuarioId, admissoesTestesHistorico.atorUsuarioId))
    .where(where)
    .orderBy(asc(admissoesTestesHistorico.ocorridoEm), asc(admissoesTestesHistorico.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return { itens, total, page: query.page, pageSize: query.pageSize };
}

/**
 * Leitura MINIMA das FUNCOES OPERACIONAIS para o formulario de Admissoes.
 *
 * Nao e `GET /api/cargos`: aquilo lista cargo de ACESSO e exige `cadastro_colaboradores_visualizar`,
 * permissao de OUTRO dominio. Sao catalogos distintos, com donos distintos.
 *
 * Devolve tambem as INATIVAS, com a marca. Filtrar aqui deixaria o formulario de edicao de um teste
 * antigo sem o proprio valor gravado na lista, e o seletor apareceria vazio — a tela desabilita a
 * escolha de inativa, que e onde essa regra pertence.
 */
export async function listarFuncoesDaEmpresaRepository(empresaId: string) {
  return banco
    .select({ id: admissoesFuncoes.id, nome: admissoesFuncoes.nome, cbo: admissoesFuncoes.cbo, ativo: admissoesFuncoes.ativo })
    .from(admissoesFuncoes)
    .where(eq(admissoesFuncoes.empresaId, empresaId))
    // Ativas primeiro; dentro de cada grupo, por nome.
    .orderBy(desc(admissoesFuncoes.ativo), asc(admissoesFuncoes.nome));
}

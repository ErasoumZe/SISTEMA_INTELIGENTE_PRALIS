import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  colaboradoresFaltasJustificadas,
  colaboradoresJornadas,
  setores,
  turnos
} from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

// O escopo virou WHERE em vez de `filtrarPorEmpresas` em memoria: antes esta consulta trazia a
// tabela INTEIRA do banco e o recorte era do service. Com `inArray` o banco devolve so o permitido,
// e escopo vazio vira `where false` em drizzle 0.45.2 (sql/expressions/conditions.js:75-77) — o
// mesmo fail-closed de `filtrarPorEmpresas` (api/src/auth/empresa.ts:16-20). O guard explicito fica
// porque versoes antigas do drizzle LANCAVAM com lista vazia; e o idioma defensivo do repo
// (clientes.repository.ts:27, lacres.repository.ts:20).
//
// `setores.id` e `turnos.id` em vez de `colaboradores.setorId`/`turnoPadraoId`: as FKs
// (db/src/schema/app.schema.ts:327,330) NAO compoem `empresa_id`, entao um colaborador pode
// carregar ponteiro para setor/turno de outra empresa. O join casa a empresa LINHA A LINHA
// (`setores.empresa_id = colaboradores.empresa_id`), entao um ponteiro estrangeiro sai NULO em vez
// de vazar o UUID do outro tenant — e a linha do colaborador continua aparecendo.
export async function listarColaboradoresRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      cpf: colaboradores.cpf,
      setorId: setores.id,
      turnoPadraoId: turnos.id,
      usuarioId: colaboradores.usuarioId
    })
    .from(colaboradores)
    .leftJoin(setores, and(eq(setores.id, colaboradores.setorId), eq(setores.empresaId, colaboradores.empresaId)))
    .leftJoin(turnos, and(eq(turnos.id, colaboradores.turnoPadraoId), eq(turnos.empresaId, colaboradores.empresaId)))
    .where(inArray(colaboradores.empresaId, escopoEmpresas))
    .orderBy(asc(colaboradores.nome));
}

// Escopo no `where` e `NO KEY UPDATE` pelos mesmos dois motivos de `bloquearColaboradorRepository`:
// sem o escopo o lock cai numa linha de outro tenant e a latencia denuncia se o cargo existe; e
// `cargos.id` e referenciado por `colaboradores_cargos.cargo_id` (0001_baseline.sql:828), entao
// `FOR UPDATE` faria toda atribuicao de cargo esperar por um simples rename.
export async function bloquearCargoRepository(cargoId: string, escopoEmpresas: string[], db: TransacaoBanco) {
  if (!escopoEmpresas.length) return null;
  const [cargo] = await db
    .select({ id: cargos.id, empresaId: cargos.empresaId })
    .from(cargos)
    .where(and(eq(cargos.id, cargoId), inArray(cargos.empresaId, escopoEmpresas)))
    .limit(1)
    .for("no key update");
  return cargo ?? null;
}

// O vinculo e o alvo REAL do `PUT /colaboradores/:cid/cargos/:ccid`, e ate aqui ele nunca era lido:
// a unica verificacao era o `where` do UPDATE, cujo resultado era descartado (falso 204).
export async function bloquearVinculoCargoRepository(
  input: { colaboradorId: string; cargoColaboradorId: string },
  db: TransacaoBanco
) {
  const [vinculo] = await db
    .select({
      id: colaboradoresCargos.id,
      empresaId: colaboradoresCargos.empresaId,
      colaboradorId: colaboradoresCargos.colaboradorId,
      ativo: colaboradoresCargos.ativo
    })
    .from(colaboradoresCargos)
    .where(
      and(
        eq(colaboradoresCargos.id, input.cargoColaboradorId),
        eq(colaboradoresCargos.colaboradorId, input.colaboradorId)
      )
    )
    .limit(1)
    // `NO KEY UPDATE`: `colaboradores_cargos.id` e referenciado por
    // `colaboradores_jornadas.colaborador_cargo_id` (0001_baseline.sql:836), e ativar/desativar um
    // vinculo nao muda coluna-chave. Nao ha por que fazer o cadastro de jornada esperar.
    .for("no key update");
  return vinculo ?? null;
}

export async function existeTurnoNaEmpresaRepository(turnoId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [turno] = await db
    .select({ id: turnos.id })
    .from(turnos)
    .where(and(eq(turnos.id, turnoId), eq(turnos.empresaId, empresaId)))
    .limit(1);
  return Boolean(turno);
}

export async function salvarColaboradorRepository(
  input: {
    id?: string;
    empresaId: string;
    nome: string;
    cpf: string | null;
    setorId?: string | null;
    turnoPadraoId?: string | null;
  },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    // `.returning()` e nao retorno fabricado: a versao anterior devolvia um objeto montado a partir
    // do INPUT mesmo com zero linhas afetadas, e por isso a rota respondia 204 para uma escrita que
    // nunca aconteceu. Agora `undefined` significa "nao gravei", e o service decide o status.
    const [atualizado] = await db
      .update(colaboradores)
      .set({
        nome: input.nome,
        cpf: input.cpf,
        setorId: input.setorId ?? null,
        turnoPadraoId: input.turnoPadraoId ?? null
      })
      .where(and(eq(colaboradores.id, input.id), eq(colaboradores.empresaId, input.empresaId)))
      .returning({ id: colaboradores.id });
    return atualizado;
  }
  const [criado] = await db
    .insert(colaboradores)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      cpf: input.cpf,
      setorId: input.setorId ?? null,
      turnoPadraoId: input.turnoPadraoId ?? null
    })
    .returning({ id: colaboradores.id });
  return criado;
}

export async function salvarCargoColaboradorRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    setorId: string | null;
    cargoId: string;
    remuneracaoMinuto: number;
    dataInicio: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  // `onConflictDoUpdate` no alvo da unica `(empresa, colaborador, cargo, data_inicio)`
  // (db/src/schema/app.schema.ts:501-506): este INSERT roda quando o colaborador ficou SEM cargo
  // ativo, e se a mesma tupla ja existisse inativa o INSERT cru estourava 23505 -> 500 + Sentry num
  // fluxo legitimo (desativar o unico cargo e depois editar o colaborador no mesmo dia). Reativar e
  // exatamente o efeito pretendido pelo bloco que chama isto.
  const [criado] = await db
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .onConflictDoUpdate({
      target: [
        colaboradoresCargos.empresaId,
        colaboradoresCargos.colaboradorId,
        colaboradoresCargos.cargoId,
        colaboradoresCargos.dataInicio
      ],
      // So `ativo`. NAO reescreve `setor_id` nem `remuneracao_minuto`: no conflito a linha ja existe
      // e e um registro de vinculo historico — sobrepor o setor com o que o formulario tem agora
      // (frequentemente `null`) apagaria dado que ninguem pediu para mudar. O objetivo do ramo e um
      // so: o colaborador voltar a ter cargo ativo.
      set: { ativo: input.ativo, atualizadoEm: new Date() }
    })
    .returning({ id: colaboradoresCargos.id });
  return criado;
}

export async function listarCargosRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({ id: cargos.id, empresaId: cargos.empresaId, nome: cargos.nome })
    .from(cargos)
    .where(inArray(cargos.empresaId, escopoEmpresas))
    .orderBy(asc(cargos.nome));
}

export async function criarCargoRepository(input: { empresaId: string; nome: string }) {
  const [cargo] = await banco
    .insert(cargos)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .onConflictDoUpdate({
      target: [cargos.empresaId, cargos.nome],
      set: { nome: input.nome, atualizadoEm: new Date() }
    })
    .returning({ id: cargos.id });
  return cargo;
}

export async function atualizarCargoRepository(
  input: { id: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  const [atualizado] = await db
    .update(cargos)
    .set({ nome: input.nome, atualizadoEm: new Date() })
    .where(and(eq(cargos.id, input.id), eq(cargos.empresaId, input.empresaId)))
    .returning({ id: cargos.id });
  return atualizado;
}

// `leftJoin` escopado no lugar do `innerJoin` cru: o recorte por empresa olhava
// `colaboradores_cargos.empresa_id`, mas o NOME e o id do cargo vinham de `cargos` sem nenhuma
// checagem — um vinculo da empresa A apontando para cargo da B devolvia o cargo da B. Agora o join
// exige `cargos.empresa_id = colaboradores_cargos.empresa_id`, e `cargoId`/`cargoNome` saem NULOS
// quando o ponteiro atravessa a fronteira, em vez de sumirem com a linha (que e o que o `innerJoin`
// faria) ou vazarem. Mesma regra para o setor.
export async function listarCargosColaboradorRepository(colaboradorId: string, escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({
      id: colaboradoresCargos.id,
      empresaId: colaboradoresCargos.empresaId,
      colaboradorId: colaboradoresCargos.colaboradorId,
      setorId: setores.id,
      cargoId: cargos.id,
      cargoNome: cargos.nome,
      remuneracaoMinuto: colaboradoresCargos.remuneracaoMinuto,
      dataInicio: colaboradoresCargos.dataInicio,
      ativo: colaboradoresCargos.ativo
    })
    .from(colaboradoresCargos)
    .leftJoin(
      cargos,
      and(eq(cargos.id, colaboradoresCargos.cargoId), eq(cargos.empresaId, colaboradoresCargos.empresaId))
    )
    .leftJoin(
      setores,
      and(eq(setores.id, colaboradoresCargos.setorId), eq(setores.empresaId, colaboradoresCargos.empresaId))
    )
    .where(
      and(eq(colaboradoresCargos.colaboradorId, colaboradorId), inArray(colaboradoresCargos.empresaId, escopoEmpresas))
    )
    .orderBy(desc(colaboradoresCargos.ativo), desc(colaboradoresCargos.dataInicio), asc(cargos.nome));
}

// `existeColaboradorNaEmpresaRepository` foi REMOVIDA aqui. Era a funcao que perguntava "este
// colaborador esta na empresa que o CORPO informou" — o caminho antigo, sem lock e decidido pelo
// pedido. Todo chamador passou a usar `bloquearColaboradorRepository`, que trava a linha e devolve a
// empresa REAL. Manter as duas deixaria a versao permissiva ao alcance do proximo refactor.
export async function existeCargoNaEmpresaRepository(cargoId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db
    .select({ id: cargos.id })
    .from(cargos)
    .where(and(eq(cargos.id, cargoId), eq(cargos.empresaId, empresaId)))
    .limit(1);
  return Boolean(cargo);
}

export async function existeSetorNaEmpresaRepository(setorId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [setor] = await db
    .select({ id: setores.id })
    .from(setores)
    .where(and(eq(setores.id, setorId), eq(setores.empresaId, empresaId)))
    .limit(1);
  return Boolean(setor);
}

export async function existeCargoAtivoColaboradorRepository(
  input: { colaboradorCargoId: string; colaboradorId: string; empresaId: string },
  db: ExecutorBanco = banco
) {
  const [cargo] = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(
      and(
        eq(colaboradoresCargos.id, input.colaboradorCargoId),
        eq(colaboradoresCargos.colaboradorId, input.colaboradorId),
        eq(colaboradoresCargos.empresaId, input.empresaId),
        eq(colaboradoresCargos.ativo, true)
      )
    )
    .limit(1);
  return Boolean(cargo);
}

export async function criarCargoColaboradorRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    setorId: string | null;
    cargoId: string;
    remuneracaoMinuto: number;
    dataInicio: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  // `onConflictDoNothing` + `returning`: repetir a mesma tupla da unica
  // `(empresa, colaborador, cargo, data_inicio)` levantava 23505, que `mensagemDominioOuRelancar`
  // relanca por ter `code` (api/src/erros.ts:9) e virava 500 INTERNAL_ERROR + Sentry num pedido
  // legitimo — dois cliques no botao bastavam. Sem linha devolvida, o service responde 409.
  const [criado] = await db
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .onConflictDoNothing({
      target: [
        colaboradoresCargos.empresaId,
        colaboradoresCargos.colaboradorId,
        colaboradoresCargos.cargoId,
        colaboradoresCargos.dataInicio
      ]
    })
    .returning({ id: colaboradoresCargos.id });
  return criado ?? null;
}

// Trava a linha RAIZ do colaborador e devolve a empresa REAL dela e o vinculo de usuario.
//
// Existe porque `colaboradores_cargos` nao tem lock proprio, e o guard "colaborador com usuario
// precisa ter ao menos um cargo ativo" lia `colaboradores.usuario_id` sem travar nada: enquanto uma
// vinculacao em `usuarios.service.ts` ainda nao commitou, esse campo e nulo, o guard nem dispara, e o
// ultimo cargo ativo cai. Resultado alcancavel: usuario vinculado a colaborador sem cargo ativo.
//
// A CX-M05 acrescentou `empresaId` a projecao e transformou esta funcao no unico portao de entrada
// de TODA escrita do modulo: e daqui que sai a empresa real do alvo, que ate entao vinha do corpo.
// O `where` continua so por `id`, de proposito — quem distingue "nao existe" de "e de outra
// empresa" e o service, e ele responde 404 nos dois casos para nao virar oraculo.
//
// A raiz e a MESMA linha que `bloquearColaboradorUsuarioRepository` trava do outro lado, entao os dois
// fluxos passam a se serializar. `TransacaoBanco`, e nao `ExecutorBanco`: `FOR UPDATE` fora de
// transacao solta o lock na instrucao seguinte e nao serializa nada.
//
// O ESCOPO entra no proprio `where`, e nao so na decisao do service. Com `FOR ...` isso deixa de ser
// estilo: travar primeiro e recusar depois faz o request ESPERAR quando o id e de outro tenant e
// esta travado por uma escrita legitima daquele tenant, e responder na hora quando o id nao existe —
// um oraculo de existencia por latencia, que os 404 iguais nao cobrem. E encosta um lock numa linha
// alheia. Com o filtro, "nao existe" e "e de outra empresa" ficam indistinguiveis ja no banco.
//
// `NO KEY UPDATE`, e NAO `UPDATE`. A diferenca decide se o cadastro trava a OPERACAO.
// `colaboradores.id` e referenciado por 9 FKs (db/migrations/0001_baseline.sql:826-941), entre elas
// `fechamentos_caixa.colaborador_id` (:860) e `debitos_colaboradores.colaborador_id` (:840). Todo
// INSERT nessas tabelas — abrir caixa, lancar despesa/retirada com credor colaborador — pega
// `FOR KEY SHARE` na linha do colaborador para checar a FK. Pela matriz de conflito do Postgres:
//
//   NO KEY UPDATE x KEY SHARE     -> NAO conflita  (a abertura de caixa nao espera o cadastro)
//   NO KEY UPDATE x NO KEY UPDATE -> conflita      (as escritas deste modulo seguem exclusivas)
//   NO KEY UPDATE x UPDATE        -> conflita      (segue serializado com o fluxo de usuarios)
//
// Preserva inteira a serializacao pretendida e para de cobrar latencia de quem so referencia a
// linha. Com `FOR UPDATE`, uma edicao de cadastro presa seguraria a abertura de caixa daquele
// colaborador por tempo indefinido — o pool nao tem `lock_timeout` (api/src/banco/conexao.ts:8-10).
// Nenhuma escrita daqui altera coluna-chave (`id` e `usuario_id` nao sao tocados: quem vincula
// usuario e `usuarios.repository.ts`, com o lock forte correto).
export async function bloquearColaboradorRepository(
  colaboradorId: string,
  escopoEmpresas: string[],
  db: TransacaoBanco
) {
  if (!escopoEmpresas.length) return null;
  const [colaborador] = await db
    .select({ id: colaboradores.id, empresaId: colaboradores.empresaId, usuarioId: colaboradores.usuarioId })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, colaboradorId), inArray(colaboradores.empresaId, escopoEmpresas)))
    .limit(1)
    .for("no key update");
  return colaborador ?? null;
}

// `empresaId` obrigatorio: sem ele a contagem cruzava a fronteira e uma linha injetada por outro
// tenant valia como "cargo ativo" na regra de negocio da vitima — e vice-versa.
export async function contarCargosAtivosColaboradorRepository(
  colaboradorId: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const cargosAtivos = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(
      and(
        eq(colaboradoresCargos.colaboradorId, colaboradorId),
        eq(colaboradoresCargos.empresaId, empresaId),
        eq(colaboradoresCargos.ativo, true)
      )
    );
  return cargosAtivos.length;
}

export async function atualizarStatusCargoColaboradorRepository(
  input: {
    colaboradorId: string;
    cargoColaboradorId: string;
    empresaId: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  const [atualizado] = await db
    .update(colaboradoresCargos)
    .set({ ativo: input.ativo, atualizadoEm: new Date() })
    .where(
      and(
        eq(colaboradoresCargos.id, input.cargoColaboradorId),
        eq(colaboradoresCargos.colaboradorId, input.colaboradorId),
        eq(colaboradoresCargos.empresaId, input.empresaId)
      )
    )
    .returning({ id: colaboradoresCargos.id });
  return atualizado;
}

export async function listarJornadasColaboradorRepository(colaboradorId: string, escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({
      id: colaboradoresJornadas.id,
      empresaId: colaboradoresJornadas.empresaId,
      colaboradorId: colaboradoresJornadas.colaboradorId,
      diaDaSemana: colaboradoresJornadas.diaDaSemana,
      cargaHorariaDiariaEmMinutos: colaboradoresJornadas.cargaHorariaDiariaEmMinutos,
      intervaloMinutos: colaboradoresJornadas.intervaloMinutos,
      colaboradorCargoId: colaboradoresCargos.id,
      horaEntrada: colaboradoresJornadas.horaEntrada,
      dataInicio: colaboradoresJornadas.dataInicio,
      ativo: colaboradoresJornadas.ativo,
      cargoNome: cargos.nome
    })
    .from(colaboradoresJornadas)
    .leftJoin(
      colaboradoresCargos,
      and(
        eq(colaboradoresCargos.id, colaboradoresJornadas.colaboradorCargoId),
        eq(colaboradoresCargos.empresaId, colaboradoresJornadas.empresaId)
      )
    )
    .leftJoin(
      cargos,
      and(eq(cargos.id, colaboradoresCargos.cargoId), eq(cargos.empresaId, colaboradoresCargos.empresaId))
    )
    .where(
      and(
        eq(colaboradoresJornadas.colaboradorId, colaboradorId),
        inArray(colaboradoresJornadas.empresaId, escopoEmpresas)
      )
    )
    .orderBy(
      desc(colaboradoresJornadas.dataInicio),
      asc(colaboradoresJornadas.diaDaSemana),
      asc(colaboradoresJornadas.horaEntrada)
    );
}

export async function criarJornadasColaboradorRepository(
  colaboradorId: string,
  input: {
    empresaId: string;
    dataInicio: string;
    faixas: Array<{
      diaDaSemana: string;
      horaEntrada: string;
      cargaHorariaDiariaEmMinutos: number;
      intervaloMinutos: number;
      colaboradorCargoId: string | null;
    }>;
  },
  db?: ExecutorBanco
) {
  return executarComTransacaoOpcional(db, async (tx) => {
    const diasAfetados = [...new Set(input.faixas.map((faixa) => faixa.diaDaSemana))];
    if (diasAfetados.length) {
      await tx
        .update(colaboradoresJornadas)
        .set({ ativo: false, atualizadoEm: new Date() })
        // `empresa_id` no `where`: era a UNICA escrita do modulo cujo conjunto afetado nao era
        // escopado. Inalcancavel hoje (a empresa vem da linha travada do colaborador), mas deixar a
        // excecao de pe convida a proxima regressao.
        .where(
          and(
            eq(colaboradoresJornadas.colaboradorId, colaboradorId),
            eq(colaboradoresJornadas.empresaId, input.empresaId),
            inArray(colaboradoresJornadas.diaDaSemana, diasAfetados)
          )
        );
    }

    const criados: string[] = [];
    for (const faixa of input.faixas) {
      const [criada] = await tx
        .insert(colaboradoresJornadas)
        .values({
          empresaId: input.empresaId,
          colaboradorId,
          diaDaSemana: faixa.diaDaSemana,
          cargaHorariaDiariaEmMinutos: faixa.cargaHorariaDiariaEmMinutos,
          intervaloMinutos: faixa.intervaloMinutos,
          colaboradorCargoId: faixa.cargaHorariaDiariaEmMinutos > 0 ? faixa.colaboradorCargoId : null,
          horaEntrada: faixa.cargaHorariaDiariaEmMinutos > 0 ? faixa.horaEntrada : null,
          dataInicio: input.dataInicio,
          ativo: true
        })
        .returning({ id: colaboradoresJornadas.id });
      if (criada?.id) criados.push(criada.id);
    }
    return { ids: criados };
  });
}

export async function listarFaltasJustificadasRepository(colaboradorId: string, escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  const faltas = await banco
    .select({
      id: colaboradoresFaltasJustificadas.id,
      empresaId: colaboradoresFaltasJustificadas.empresaId,
      colaboradorId: colaboradoresFaltasJustificadas.colaboradorId,
      inicio: colaboradoresFaltasJustificadas.inicio,
      fim: colaboradoresFaltasJustificadas.fim,
      motivo: colaboradoresFaltasJustificadas.motivo
    })
    .from(colaboradoresFaltasJustificadas)
    .where(
      and(
        eq(colaboradoresFaltasJustificadas.colaboradorId, colaboradorId),
        inArray(colaboradoresFaltasJustificadas.empresaId, escopoEmpresas)
      )
    )
    .orderBy(desc(colaboradoresFaltasJustificadas.inicio));
  return faltas.map((falta) => ({ ...falta, inicio: falta.inicio.toISOString(), fim: falta.fim.toISOString() }));
}

export async function criarFaltaJustificadaRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    inicio: string;
    fim: string;
    motivo: string;
  },
  db: ExecutorBanco = banco
) {
  const [criada] = await db
    .insert(colaboradoresFaltasJustificadas)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      inicio: new Date(input.inicio),
      fim: new Date(input.fim),
      motivo: input.motivo
    })
    .returning({ id: colaboradoresFaltasJustificadas.id });
  return criada;
}

// `null` = sem recorte (contrato herdado de `permitidoNoEscopoEmpresa`, api/src/utils.ts:30-32);
// lista vazia = nada permitido, e `inArray` com lista vazia vira `false` no drizzle 0.45.2. Os
// chamadores deste modulo sempre passam lista concreta — o `null` so existe para nao mudar o tipo
// compartilhado.
function escopoOrigem(coluna: PgColumn, empresasPermitidasIds: string[] | null) {
  return empresasPermitidasIds === null ? undefined : inArray(coluna, empresasPermitidasIds);
}

async function completarColaboradores(
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  db: ExecutorBanco
) {
  const colaboradoresDestino = await db
    .select()
    .from(colaboradores)
    .where(eq(colaboradores.empresaId, empresaDestinoId))
    // `ORDER BY id`: o laco abaixo faz UPDATE linha a linha. Duas importacoes simultaneas em
    // sentidos opostos (A->B e B->A) fechariam ciclo se cada uma tocasse as linhas numa ordem.
    .orderBy(asc(colaboradores.id));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  // So as origens que estas linhas de destino declaram ter importado, e so dentro do escopo do ator.
  // Antes era `select().from(colaboradores)` — a tabela inteira do banco, todos os tenants.
  const origensDeclaradas = [
    ...new Set(colaboradoresDestino.map((destino) => destino.idImportado).filter((id): id is string => Boolean(id)))
  ];
  const colaboradoresOrigem = origensDeclaradas.length
    ? await db
        .select()
        .from(colaboradores)
        .where(
          and(
            inArray(colaboradores.id, origensDeclaradas),
            escopoOrigem(colaboradores.empresaId, empresasPermitidasIds)
          )
        )
    : [];
  for (const destino of colaboradoresDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = colaboradoresOrigem.find((item) => item.id === destino.idImportado);
    if (!origem?.setorId) continue;
    const setorDestino = setoresDestino.find(
      (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.setorId
    );
    if (setorDestino)
      await db.update(colaboradores).set({ setorId: setorDestino.id }).where(eq(colaboradores.id, destino.id));
  }
}

export async function copiarColaboradoresRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    // O escopo virou WHERE: antes esta consulta varria `colaboradores` inteira (todas as empresas do
    // banco) e o recorte era so o `filtrarOrigemEntidade` em memoria. `filtrarOrigemEntidade`
    // continua — ele aplica o filtro por id/empresa de origem —, mas ja sobre um conjunto que o
    // banco recortou.
    const origem = filtrarOrigemEntidade(
      await db.select().from(colaboradores).where(escopoOrigem(colaboradores.empresaId, empresasPermitidasIds)),
      filtro,
      empresasPermitidasIds
    );
    const destinos = await db.select().from(colaboradores).where(eq(colaboradores.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const colaborador of origem) {
      if (jaImportado(destinos, colaborador.empresaId, colaborador.id)) continue;
      await db.insert(colaboradores).values({
        empresaId: empresaDestinoId,
        nome: colaborador.nome,
        cpf: colaborador.cpf,
        setorId: null,
        usuarioId: null,
        importadoDe: colaborador.empresaId,
        idImportado: colaborador.id
      });
      inseridos += 1;
    }
    if (modo === "completo") await completarColaboradores(empresaDestinoId, empresasPermitidasIds, db);
    return { tipo: "colaboradores", inseridos };
  });
}

export async function copiarCargosRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(
      await db.select().from(cargos).where(escopoOrigem(cargos.empresaId, empresasPermitidasIds)),
      filtro,
      empresasPermitidasIds
    );
    const destinos = await db.select().from(cargos).where(eq(cargos.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const cargo of origem) {
      if (jaImportado(destinos, cargo.empresaId, cargo.id)) continue;
      // Conta o que o banco REALMENTE inseriu: com `onConflictDoNothing` o contador cego somava
      // mesmo quando o INSERT era descartado por `cargos_empresa_nome_unica`, e a tela dizia
      // "importados N" com N maior que a verdade.
      const criados = await db
        .insert(cargos)
        .values({ empresaId: empresaDestinoId, nome: cargo.nome, importadoDe: cargo.empresaId, idImportado: cargo.id })
        .onConflictDoNothing()
        .returning({ id: cargos.id });
      inseridos += criados.length;
    }
    return { tipo: "cargos", inseridos };
  });
}

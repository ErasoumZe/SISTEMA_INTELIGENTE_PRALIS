import type { DadosExternos } from "@padaria/shared/api";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sum
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  colaboradores,
  colaboradoresCargos,
  cargos,
  contasUsuarios,
  empresas,
  maquininhas,
  pdvs,
  perfisUsuarios,
  turnos
} from "@padaria/db/schema/cadastro";
import {
  alteracoesPosFechamentoCaixa,
  ajustesFechamentoCaixa,
  debitosColaboradores,
  edicoesCaixa,
  fechamentosCaixa,
  quebrasCaixa
} from "@padaria/db/schema/caixa";
import { despesas } from "@padaria/db/schema/despesa";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import { lacres, transferencias, transferenciasDestinosCandidatos } from "@padaria/db/schema/transferencia";
import { vendas } from "@padaria/db/schema/venda";
import {
  transferenciaContaComoEntrada,
  valorEntradaCentavos,
  transferenciaContaComoSaida,
  type TotaisCaixaCentavos
} from "@padaria/shared/caixa";
import { diaNegocio } from "@padaria/shared/datas";
import { centavosParaDecimalBanco, liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

const perfilFechador = alias(perfisUsuarios, "perfil_fechador");

export async function buscarPdvEmpresaRepository(pdvId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [pdv] = await db
    .select({
      id: pdvs.id,
      empresaId: pdvs.empresaId,
      nome: pdvs.nome,
      codigo: pdvs.codigo,
      contaId: pdvs.contaId,
      ativo: pdvs.ativo
    })
    .from(pdvs)
    .where(and(eq(pdvs.id, pdvId), eq(pdvs.empresaId, empresaId)))
    .limit(1);
  return pdv ?? null;
}

// S3 (R-164), outra metade da janela: a ABERTURA decide o destino do fundo pela conta do PDV, e o
// `PUT /api/pdvs/:id` pode trocar essa conta no meio. `FOR SHARE` (e nao `KEY SHARE`) DE PROPOSITO:
// KEY SHARE so conflita com `FOR UPDATE`, entao a garantia dependeria da convencao de `salvarPdv`
// travar antes de escrever — um UPDATE direto em `pdvs` (job, script, rota futura) toma apenas
// NO KEY UPDATE e reabriria a janela EM SILENCIO. Com SHARE a protecao e do dado, nao do costume.
// Custo real: nenhum hoje (o unico escritor ja toma FOR UPDATE). O que continua livre: aberturas
// concorrentes (SHARE ∥ SHARE) e os RI checks de FK que INSERTs de venda/caixa tomam (KEY SHARE).
// Ordem preservada: pdv -> caixa dos dois lados, a mesma que a FK `fechamentos_caixa.pdv_id` ja
// impunha no INSERT alguns passos adiante.
export async function travarPdvDaAberturaRepository(pdvId: string, empresaId: string, db: TransacaoBanco) {
  const [pdv] = await db
    .select({
      id: pdvs.id,
      empresaId: pdvs.empresaId,
      nome: pdvs.nome,
      codigo: pdvs.codigo,
      contaId: pdvs.contaId,
      ativo: pdvs.ativo
    })
    .from(pdvs)
    .where(and(eq(pdvs.id, pdvId), eq(pdvs.empresaId, empresaId)))
    .limit(1)
    .for("share");
  return pdv ?? null;
}

export async function buscarColaboradorPorUsuarioRepository(
  usuarioId: string,
  empresaId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(colaboradores.usuarioId, usuarioId)];
  if (empresaId) filtros.push(eq(colaboradores.empresaId, empresaId));
  const [colaborador] = await db
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      usuarioId: colaboradores.usuarioId,
      turnoPadraoId: colaboradores.turnoPadraoId
    })
    .from(colaboradores)
    .where(and(...filtros))
    .limit(1);
  return colaborador ?? null;
}

export async function buscarPerfilUsuarioCaixaRepository(usuarioId: string, db: ExecutorBanco = banco) {
  const [usuario] = await db
    .select({ usuarioId: perfisUsuarios.usuarioId, nome: perfisUsuarios.nome })
    .from(perfisUsuarios)
    .where(eq(perfisUsuarios.usuarioId, usuarioId))
    .limit(1);
  return usuario ?? null;
}

export async function buscarCaixaAbertoUsuarioRepository(
  empresaId: string,
  usuarioCaixaId: string,
  db: ExecutorBanco = banco
) {
  const [caixa] = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      pdvContaId: pdvs.contaId,
      usuarioId: fechamentosCaixa.usuarioId,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      abertoEm: fechamentosCaixa.abertoEm,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoEm: fechamentosCaixa.fechadoEm,
      fechadoPor: fechamentosCaixa.fechadoPor,
      tokenEdicao: fechamentosCaixa.tokenEdicao,
      turnoId: fechamentosCaixa.turnoId,
      maquininhaId: fechamentosCaixa.maquininhaId,
      maquininhaApelido: maquininhas.apelido,
      maquininhaNumeroSerie: maquininhas.numeroSerie,
      observacao: fechamentosCaixa.observacao,
      dividaCofre: fechamentosCaixa.dividaCofre,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .leftJoin(maquininhas, eq(maquininhas.id, fechamentosCaixa.maquininhaId))
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        eq(fechamentosCaixa.usuarioCaixaId, usuarioCaixaId),
        eq(fechamentosCaixa.status, "aberto")
      )
    )
    .orderBy(desc(fechamentosCaixa.criadoEm))
    .limit(1);
  return caixa ?? null;
}

export async function buscarCaixaPorIdRepository(caixaId: string, db: ExecutorBanco = banco) {
  const [caixa] = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      pdvContaId: pdvs.contaId,
      usuarioId: fechamentosCaixa.usuarioId,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      abertoEm: fechamentosCaixa.abertoEm,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoEm: fechamentosCaixa.fechadoEm,
      fechadoPor: fechamentosCaixa.fechadoPor,
      tokenEdicao: fechamentosCaixa.tokenEdicao,
      turnoId: fechamentosCaixa.turnoId,
      maquininhaId: fechamentosCaixa.maquininhaId,
      maquininhaApelido: maquininhas.apelido,
      maquininhaNumeroSerie: maquininhas.numeroSerie,
      observacao: fechamentosCaixa.observacao,
      dividaCofre: fechamentosCaixa.dividaCofre,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .leftJoin(maquininhas, eq(maquininhas.id, fechamentosCaixa.maquininhaId))
    .where(eq(fechamentosCaixa.id, caixaId))
    .limit(1);
  return caixa ?? null;
}

export async function existeCaixaAbertoPdvRepository(
  pdvId: string,
  caixaIgnoradoId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(fechamentosCaixa.pdvId, pdvId), eq(fechamentosCaixa.status, "aberto")];
  if (caixaIgnoradoId) filtros.push(ne(fechamentosCaixa.id, caixaIgnoradoId));
  const [caixa] = await db
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(and(...filtros))
    .limit(1);
  return Boolean(caixa);
}

export async function existePeriodoCaixaRepository(
  pdvId: string,
  dataHoraAbertura: Date,
  caixaIgnoradoId?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [eq(fechamentosCaixa.pdvId, pdvId)];
  if (caixaIgnoradoId) filtros.push(ne(fechamentosCaixa.id, caixaIgnoradoId));
  const caixas = await db
    .select({
      status: fechamentosCaixa.status,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento
    })
    .from(fechamentosCaixa)
    .where(and(...filtros));
  return caixas.some((caixa) => {
    if (caixa.status === "aberto") return true;
    if (!caixa.dataHoraFechamento) return false;
    return dataHoraAbertura <= new Date(caixa.dataHoraFechamento);
  });
}

export async function buscarMaquininhaEmpresaRepository(
  maquininhaId: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const [item] = await db
    .select({ id: maquininhas.id })
    .from(maquininhas)
    .where(and(eq(maquininhas.id, maquininhaId), eq(maquininhas.empresaId, empresaId), eq(maquininhas.ativo, true)))
    .limit(1);
  return item ?? null;
}

export async function criarCaixaRepository(
  input: {
    empresaId: string;
    pdvId: string;
    usuarioId: string;
    usuarioCaixaId: string;
    colaboradorId: string;
    dataHoraAbertura: Date;
    tokenEdicao: string;
    turnoId: string | null;
    observacao: string | null;
    // R-040: o lacre digitado na abertura, que identificou a transferencia confirmada. R-001: o
    // fundo NAO e emprestimo, entao dividaCofre nasce zero (coluna legado, ver 18 D-08).
    lacreAbertura?: string | null;
    maquininhaId?: string | null;
  },
  db: ExecutorBanco = banco
) {
  const [caixa] = await db
    .insert(fechamentosCaixa)
    .values({
      empresaId: input.empresaId,
      pdvId: input.pdvId,
      usuarioId: input.usuarioId,
      usuarioCaixaId: input.usuarioCaixaId,
      colaboradorId: input.colaboradorId,
      turnoId: input.turnoId,
      dataMovimento: diaNegocio(input.dataHoraAbertura),
      dataHoraAbertura: input.dataHoraAbertura,
      abertoEm: new Date(),
      tokenEdicao: input.tokenEdicao,
      observacao: input.observacao,
      lacreAbertura: input.lacreAbertura ?? null,
      maquininhaId: input.maquininhaId ?? null,
      dividaCofre: centavosParaDecimalBanco(0),
      status: "aberto",
      criadoPor: input.usuarioId
    })
    .returning({ id: fechamentosCaixa.id });
  if (!caixa) throw new Error("Caixa nao criado");
  return caixa;
}

export async function criarQuebraCaixaRepository(
  input: {
    empresaId: string;
    fechamentoCaixaId: string;
    usuarioId: string;
    valorCentavos: number;
    observacao: string;
    // R-183 · qual entrega gerou a quebra. Ausente = quebra de CONTAGEM do turno, que e a unica que
    // existia ate aqui — por isso o default e null e todo o historico continua valendo.
    transferenciaId?: string | null;
  },
  db: ExecutorBanco = banco
) {
  const [quebra] = await db
    .insert(quebrasCaixa)
    .values({
      empresaId: input.empresaId,
      fechamentoCaixaId: input.fechamentoCaixaId,
      usuarioId: input.usuarioId,
      valor: centavosParaDecimalBanco(input.valorCentavos),
      observacao: input.observacao,
      transferenciaId: input.transferenciaId ?? null
    })
    .returning({ id: quebrasCaixa.id });
  if (!quebra) throw new Error("Quebra de caixa nao registrada");
  return quebra;
}

export async function listarUsuariosTesourariaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .selectDistinct({ usuarioId: colaboradores.usuarioId })
    .from(colaboradoresCargos)
    .innerJoin(colaboradores, eq(colaboradores.id, colaboradoresCargos.colaboradorId))
    .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
    .where(
      and(
        eq(colaboradoresCargos.empresaId, empresaId),
        eq(colaboradoresCargos.ativo, true),
        ilike(cargos.nome, "%Tesouraria%"),
        isNotNull(colaboradores.usuarioId)
      )
    );
}

// --- Abertura por LACRE (R-040) e retorno ao cofre ---------------------------------------------
// Conta contabil do cofre da empresa: DESTINO do retorno/sangria do caixa (R-008b). Regra 5:
// mapeamento explicito; null quando a empresa nao configurou (o retorno falha com mensagem clara).
export async function buscarContaCofreEmpresaRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const [empresa] = await db
    .select({ contaCofreId: empresas.contaCofreId })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return empresa?.contaCofreId ?? null;
}

// R-040: a transferencia PENDENTE identificada pelo lacre digitado na abertura. O caixa que abre e
// um dos destinos candidatos (R-030) — a disputa e resolvida no UPDATE atomico abaixo, nao aqui.
// Retorna o suficiente para o servico distinguir os motivos de recusa (inexistente / rompido /
// nao-pendente / caixa fora dos candidatos) em vez de um "lacre invalido" generico.
export async function buscarTransferenciaPorLacreAberturaRepository(
  empresaId: string,
  numeroLacre: string,
  contaCaixaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({
      lacreId: lacres.id,
      lacreRompido: lacres.rompido,
      transferenciaId: transferencias.id,
      status: transferencias.status,
      valorOriginal: transferencias.valorOriginal,
      contaOrigemId: transferencias.contaOrigemId,
      caixaId: transferencias.caixaId,
      criadoPor: transferencias.criadoPor,
      candidatoId: transferenciasDestinosCandidatos.id
    })
    .from(lacres)
    .innerJoin(transferencias, eq(transferencias.id, lacres.transferenciaId))
    .leftJoin(
      transferenciasDestinosCandidatos,
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferencias.id),
        eq(transferenciasDestinosCandidatos.contaId, contaCaixaId)
      )
    )
    .where(and(eq(lacres.empresaId, empresaId), ilike(lacres.numero, numeroLacre), eq(lacres.origem, "saida")))
    .limit(1);
  return linha ?? null;
}

// R-040: o ato unico de confirmar. Vence a disputa (R-030) e rompe o lacre (R-027) na MESMA
// transacao da abertura do caixa. O `where status = 'pendente'` e a trava: sob concorrencia o
// segundo caixa bloqueia na linha, reavalia e nao atualiza nada — devolve null e o servico recusa.
// Meia confirmacao e impossivel: qualquer falha aqui derruba a transacao inteira, inclusive o caixa.
export async function confirmarTransferenciaAberturaRepository(
  input: {
    transferenciaId: string;
    lacreId: string;
    contaCaixaId: string;
    caixaId: string;
    usuarioId: string;
    agora: Date;
  },
  db: ExecutorBanco = banco
): Promise<{ id: string; valorOriginal: string } | null> {
  const [vencedora] = await db
    .update(transferencias)
    .set({
      contaDestinoId: input.contaCaixaId,
      caixaId: input.caixaId,
      // A transferencia so vira "abertura" no instante em que um caixa a reivindica: ate ali ela e
      // uma saida do cofre que ainda nao sabe qual caixa vai abrir (R-030).
      tipo: "abertura",
      status: "recebido",
      confirmadoPor: input.usuarioId,
      dataRecebimento: input.agora,
      atualizadoEm: input.agora
    })
    .where(
      and(
        eq(transferencias.id, input.transferenciaId),
        eq(transferencias.status, "pendente"),
        // S4 (R-164): imposicao ATOMICA — transferencia ja vinculada a um caixa (saida ja contada
        // la) nunca e migrada pelo claim de outro caixa. O servico recusa antes com mensagem
        // clara; este predicado e a rede que vale mesmo sob corrida.
        isNull(transferencias.caixaId)
      )
    )
    .returning({ id: transferencias.id, valorOriginal: transferencias.valorOriginal });
  if (!vencedora) return null;

  const [lacre] = await db
    .update(lacres)
    .set({ rompido: true })
    .where(and(eq(lacres.id, input.lacreId), eq(lacres.rompido, false)))
    .returning({ id: lacres.id });
  return lacre ? vencedora : null;
}

// --- Concorrencia do caixa (B1/B2) ------------------------------------------------------------
// Trava a LINHA do caixa ate o fim da transacao. Quem chegar depois espera aqui e, ao passar, ja
// enxerga o commit do primeiro (READ COMMITTED tira snapshot novo por comando) — e so por isso o
// teto do retorno e a guarda do fechamento conseguem ser reavaliados sobre o saldo REAL.
// Sem join de proposito: FOR UPDATE nao pode ser aplicado ao lado nulavel de um outer join.
export async function travarCaixaRepository(
  caixaId: string,
  db: ExecutorBanco = banco
): Promise<{ id: string; status: string } | null> {
  const [linha] = await db
    .select({ id: fechamentosCaixa.id, status: fechamentosCaixa.status })
    .from(fechamentosCaixa)
    .where(eq(fechamentosCaixa.id, caixaId))
    .for("update");
  return linha ?? null;
}

// P0 lancamento x fechamento: o lock COMPARTILHADO do lado do lancamento. `FOR SHARE` nao
// serializa lancamentos entre si, mas conflita com o `FOR UPDATE` de fechamento/cofre/horario/
// abertura (e conflitaria tambem com um futuro `NO KEY UPDATE`) — quem chegar depois espera, e o
// status devolvido aqui e o da versao commitada MAIS RECENTE (READ COMMITTED reavalia no
// locked-read). E a primeira barreira de TODA escrita que altera os sete totais — inclusive o
// cron de agendadas e o cancelamento de serie de recorrencia (S1/S2, decididos pelo Jose em
// 11/08: caixa fechado nao e alterado por nenhum dos dois). Bordas que seguem SEM regra estao
// no relatorio da OS (S3-S8). A revalidacao do status pos-lock e de quem chama.
//
// INVARIANTES (a prova de deadlock depende delas — ver o grafo no relatorio da OS):
//  1. ordem unica: linha do caixa PRIMEIRO, linha do lancamento depois, filhas por ultimo;
//  2. nenhum caminho de lancamento faz UPDATE em `fechamentos_caixa` — o SHARE nunca vira
//     exclusivo dentro da mesma transacao;
//  3. `TransacaoBanco` de proposito (sem default `banco`): FOR SHARE fora de transacao nao
//     serializa nada, e `executarComTransacaoOpcional` tornaria o erro silencioso;
//  4. sem joins — FOR SHARE nao pode ser aplicado ao lado nulavel de um outer join.
// S3: o caixa ABERTO de um PDV, com id (o booleano de `existeCaixaAbertoPdvRepository` nao basta
// para travar). Uma linha no maximo, garantida pelo indice unico parcial de caixa aberto por PDV.
export async function buscarCaixaAbertoDoPdvRepository(pdvId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(and(eq(fechamentosCaixa.pdvId, pdvId), eq(fechamentosCaixa.status, "aberto")))
    .limit(1);
  return linha ?? null;
}

export async function travarCaixaCompartilhadoRepository(
  caixaId: string,
  db: TransacaoBanco
): Promise<{ id: string; status: string } | null> {
  const [linha] = await db
    .select({ id: fechamentosCaixa.id, status: fechamentosCaixa.status })
    .from(fechamentosCaixa)
    .where(eq(fechamentosCaixa.id, caixaId))
    .for("share");
  return linha ?? null;
}

// --- Retorno / sangria (M2, R3/R4/R6) ---------------------------------------------------------
// Proxima ordem (1a/2a/3a/4a) das transferencias de um caixa por tipo (R6). App-managed.
export async function proximaOrdemTransferenciaRepository(
  caixaId: string,
  tipo: string,
  db: ExecutorBanco = banco
): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(transferencias)
    .where(and(eq(transferencias.caixaId, caixaId), eq(transferencias.tipo, tipo)));
  return Number(linha?.total ?? 0) + 1;
}

// Lacre do RETORNO/sangria (R-026: opcional; R-027: numero novo a cada movimento). Nasce nao
// rompido — a volta so e "recebida" quando a tesouraria confere o dinheiro no cofre.
export async function criarLacreRetornoRepository(
  input: { empresaId: string; numero: string; transferenciaId: string },
  db: ExecutorBanco = banco
): Promise<void> {
  await db.insert(lacres).values({
    empresaId: input.empresaId,
    numero: input.numero,
    transferenciaId: input.transferenciaId,
    origem: "retorno"
  });
}

// B2: a INTENCAO por tras de uma chave de idempotencia. E o que se compara para decidir entre
// "retry do mesmo ato" (devolve o vencedor) e "chave reaproveitada para outra coisa" (409).
// Valor em centavos inteiros — comparar a string decimal do banco ("100.00" vs "100.0") daria
// falso conflito.
export type IntencaoEntregaCofre = {
  id: string;
  caixaId: string | null;
  tipo: string;
  valorCentavos: number;
  lacre: string | null;
  observacao: string | null;
  status: string;
};

// B2: le a linha vencedora de uma chave, escopada por EMPRESA. O escopo nao e cosmetico: sem ele,
// duas empresas que sorteiem o mesmo uuid (ou um cliente que reuse chave entre empresas) veriam
// o movimento uma da outra.
export async function buscarTransferenciaPorIdempotenciaRepository(
  empresaId: string,
  idempotenciaChave: string,
  db: ExecutorBanco = banco
): Promise<IntencaoEntregaCofre | null> {
  const [linha] = await db
    .select({
      id: transferencias.id,
      caixaId: transferencias.caixaId,
      tipo: transferencias.tipo,
      valorOriginal: transferencias.valorOriginal,
      lacre: transferencias.nLacreDoc,
      observacao: transferencias.observacao,
      status: transferencias.status
    })
    .from(transferencias)
    .where(and(eq(transferencias.empresaId, empresaId), eq(transferencias.idempotenciaChave, idempotenciaChave)))
    .limit(1);
  if (!linha) return null;
  const { valorOriginal, ...resto } = linha;
  return { ...resto, valorCentavos: paraCentavos(valorOriginal) };
}

// Transferencia caixa -> cofre (retorno no fechamento / sangria no turno — R4, mesma entidade).
export async function criarTransferenciaCofreRepository(
  input: {
    empresaId: string;
    caixaId: string;
    contaCaixaId: string;
    contaCofreId: string;
    valorCentavos: number;
    tipo: string;
    ordem: number;
    dataReferencia: string;
    dataTransferencia: string;
    nLacreDoc: string | null;
    descricao: string;
    observacao: string | null;
    criadoPor: string;
    // D2/D3: a entrega do operador nasce 'pendente' — quem opera a conta do cofre confere depois
    // (R-028/R-036). D4: a solicitacao programada pela tesouraria nasce 'agendada', que NAO conta
    // como saida (shared/caixa/regras.ts) — programar nao movimenta dinheiro.
    status: "pendente" | "agendada";
    // B2: null so no retorno final do fechamento, que e protegido pela trava + guarda de status.
    idempotenciaChave: string | null;
    // D4: carimbado SO quando a linha nasce de uma solicitacao programada. E o marcador que separa
    // este fluxo do generico e da entrega avulsa — sem ele, uma transferencia generica `agendada`
    // ligada ao caixa apareceria como solicitacao, bloquearia o fechamento e poderia ser executada
    // pelo endpoint D4. Null em todo o resto.
    solicitacaoCofreEm: Date | null;
  },
  db: ExecutorBanco = banco
): Promise<{ id: string; criada: boolean }> {
  const [transferencia] = await db
    .insert(transferencias)
    .values({
      empresaId: input.empresaId,
      caixaId: input.caixaId,
      dataReferencia: input.dataReferencia,
      dataTransferencia: input.dataTransferencia,
      descricao: input.descricao,
      observacao: input.observacao,
      valorOriginal: centavosParaDecimalBanco(input.valorCentavos),
      contaOrigemId: input.contaCaixaId,
      contaDestinoId: input.contaCofreId,
      nLacreDoc: input.nLacreDoc,
      tipo: input.tipo,
      ordem: input.ordem,
      status: input.status,
      idempotenciaChave: input.idempotenciaChave,
      solicitacaoCofreEm: input.solicitacaoCofreEm,
      criadoPor: input.criadoPor
    })
    // B2: quem resolve a corrida e o BANCO, e resolve sem abortar a transacao. Com um INSERT cru,
    // o perdedor levantaria 23505 e mataria tudo que ja foi feito na mesma transacao (inclusive o
    // fechamento). Com DO NOTHING ele apenas nao insere, devolve zero linhas, e quem chama le a
    // linha vencedora e responde 200. O `where` reproduz o predicado do indice PARCIAL — sem ele o
    // Postgres nao consegue inferir qual indice usar e recusa o comando.
    .onConflictDoNothing({
      target: [transferencias.empresaId, transferencias.idempotenciaChave],
      where: isNotNull(transferencias.idempotenciaChave)
    })
    .returning({ id: transferencias.id });
  // Perdeu a corrida (ou e retry): nada foi inserido. Nao e erro — quem chama busca o vencedor.
  if (!transferencia) return { id: "", criada: false };
  // Sem esta linha a confirmacao e impossivel: confirmarTransferenciaRepository so aceita quem
  // opera uma conta candidata ao destino. O caixa->cofre tinha destino unico e nenhum candidato,
  // por isso nascia 'recebido' — ninguem tinha como conferir.
  await db.insert(transferenciasDestinosCandidatos).values({
    empresaId: input.empresaId,
    transferenciaId: transferencia.id,
    contaId: input.contaCofreId
  });
  return { id: transferencia.id, criada: true };
}

// D4: os caixas ABERTOS da empresa, com o minimo para a retaguarda escolher um destino.
//
// Existe separado de `/api/caixa/historico` porque aquele e gated por `caixas_gerenciar`, que a
// Tesouraria nao tem (e nao deve ter — ela nao opera caixa). Ampliar o gate do historico abriria
// o historico inteiro para quem so precisa saber "quais caixas estao abertos agora".
export async function listarCaixasAbertosRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: fechamentosCaixa.id,
      pdvNome: pdvs.nome,
      usuarioCaixaNome: perfisUsuarios.nome,
      dataMovimento: fechamentosCaixa.dataMovimento,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .where(and(eq(fechamentosCaixa.empresaId, empresaId), eq(fechamentosCaixa.status, "aberto")))
    .orderBy(asc(pdvs.nome));
}

// --- D4 · solicitacao programada -------------------------------------------------------------
// TODA consulta D4 exige o marcador `solicitacao_cofre_em`. Filtrar so por caixa + status era um
// vazamento entre fluxos: `criarTransferencia` (generica) grava `caixa_id` quando a transferencia
// envolve a conta do PDV, e nasce 'agendada' se tiver `agendadaPara`. Sem o marcador, essa linha
// aparecia como solicitacao, bloqueava o fechamento e podia ser executada pelo endpoint D4 —
// corrompendo uma transferencia que nunca foi uma ordem de entrega ao cofre.
//
// Tipo e destino nao bastam: depois de executada, a solicitacao vira 'pendente'/'sangria' para o
// mesmo cofre, indistinguivel de uma entrega avulsa. So um marcador de ORIGEM resolve.
const daSolicitacaoCofre = isNotNull(transferencias.solicitacaoCofreEm);

// As solicitacoes 'agendada' de um caixa. Nao movimentam saldo (regras.ts nao as conta como saida);
// existem para o operador saber o que a Tesouraria pediu que ele entregasse.
export async function listarSolicitacoesCofreRepository(caixaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: transferencias.id,
      tipo: transferencias.tipo,
      valorOriginal: transferencias.valorOriginal,
      observacao: transferencias.observacao,
      criadoPor: transferencias.criadoPor,
      criadoEm: transferencias.criadoEm
    })
    .from(transferencias)
    .where(and(eq(transferencias.caixaId, caixaId), eq(transferencias.status, "agendada"), daSolicitacaoCofre))
    .orderBy(asc(transferencias.criadoEm));
}

// D4: uma solicitacao especifica, em QUALQUER status. Quem chama precisa distinguir "nao existe"
// (404) de "existe e ja foi executada" (repeticao, responde sem duplicar).
export async function buscarSolicitacaoCofreRepository(
  solicitacaoId: string,
  caixaId: string,
  db: ExecutorBanco = banco
): Promise<{
  id: string;
  tipo: string;
  valorCentavos: number;
  status: string;
  observacao: string | null;
  // Lacre gravado NA EXECUCAO. E o unico conteudo proprio do ato fisico, e por isso e ele que
  // distingue "retry da mesma execucao" (200) de "execucao com outro envelope" (409).
  lacre: string | null;
  // Quem entregou o dinheiro. Null enquanto 'agendada'. Preservado apos a confirmacao.
  executadoPor: string | null;
  // R-183 · quem PROGRAMOU. Sai daqui para o portao do confirmador excluir as duas pessoas de uma
  // vez — o programador e o executor —, e nao so quem esta executando agora.
  criadoPor: string | null;
} | null> {
  const [linha] = await db
    .select({
      id: transferencias.id,
      tipo: transferencias.tipo,
      valorOriginal: transferencias.valorOriginal,
      status: transferencias.status,
      observacao: transferencias.observacao,
      criadoPor: transferencias.criadoPor,
      lacre: transferencias.nLacreDoc,
      executadoPor: transferencias.executadoPor
    })
    .from(transferencias)
    .where(and(eq(transferencias.id, solicitacaoId), eq(transferencias.caixaId, caixaId), daSolicitacaoCofre))
    .limit(1);
  if (!linha) return null;
  const { valorOriginal, ...resto } = linha;
  return { ...resto, valorCentavos: paraCentavos(valorOriginal) };
}

// D4: a EXECUCAO da solicitacao. A mesma linha vira 'pendente' — a mesma transicao que o cron
// generico aplica (efetivarTransferenciaAgendadaRepository), nao um segundo mecanismo.
//
// `status = 'agendada'` no WHERE e a TRANSICAO ATOMICA que serve de idempotencia: duas execucoes
// concorrentes disputam a mesma linha e so uma acerta uma linha. A perdedora recebe zero e
// responde com o estado atual, sem criar movimento nem segundo lacre.
//
// D10 · o que este UPDATE NAO toca, e por que:
//   - `valorOriginal` e `observacao`: sao da PROGRAMACAO e imutaveis. A retaguarda pediu R$ 100,
//     entao a execucao movimenta R$ 100. Excedente vira movimento avulso proprio.
//   - `idempotenciaChave`: e a ancora da CRIACAO. Sobrescreve-la aqui apagava a chave da
//     programacao — e um retry da programacao, nao encontrando mais a linha, criava OUTRA
//     solicitacao. Era esse o bug.
// Sobra o que e do ato fisico: status, lacre do envelope, ordinal, a data real do movimento e a
// IDENTIDADE de quem executou — `criado_por` responde quem PROGRAMOU, e quem executa costuma ser
// outra pessoa (`podeOperarCaixa` aceita gerente, quem abriu o caixa ou o operador designado).
// Como o WHERE exige 'agendada', so um chamador acerta a linha: retry e corrida jamais reescrevem
// `executado_por`/`executado_em`.
export async function executarSolicitacaoCofreRepository(
  input: {
    solicitacaoId: string;
    caixaId: string;
    lacre: string | null;
    ordem: number;
    dataTransferencia: string;
    executadoPor: string;
  },
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  const [linha] = await db
    .update(transferencias)
    .set({
      status: "pendente",
      nLacreDoc: input.lacre,
      ordem: input.ordem,
      dataTransferencia: input.dataTransferencia,
      executadoPor: input.executadoPor,
      executadoEm: new Date(),
      atualizadoEm: new Date()
    })
    .where(
      and(
        eq(transferencias.id, input.solicitacaoId),
        eq(transferencias.caixaId, input.caixaId),
        eq(transferencias.status, "agendada"),
        daSolicitacaoCofre
      )
    )
    .returning({ id: transferencias.id });
  return linha ?? null;
}

// D4/decisao 2: cancela uma solicitacao ainda `agendada`. NAO apaga a linha — grava autoria, data e
// motivo, e o CHECK do banco exige os tres. `WHERE status = 'agendada'` e a guarda: cancelar duas
// vezes acerta zero linhas na segunda, entao o retry nao duplica auditoria; e `pendente`/`recebido`
// (ja executadas) sao imutaveis por construcao.
// K1, valor, observacao e o marcador da programacao ficam intactos.
export async function cancelarSolicitacaoCofreRepository(
  input: { solicitacaoId: string; caixaId: string; canceladoPor: string; motivo: string },
  db: ExecutorBanco = banco
): Promise<{ id: string } | null> {
  const [linha] = await db
    .update(transferencias)
    .set({
      status: "cancelada",
      canceladoPor: input.canceladoPor,
      canceladoEm: new Date(),
      motivoCancelamento: input.motivo,
      atualizadoEm: new Date()
    })
    .where(
      and(
        eq(transferencias.id, input.solicitacaoId),
        eq(transferencias.caixaId, input.caixaId),
        eq(transferencias.status, "agendada"),
        daSolicitacaoCofre
      )
    )
    .returning({ id: transferencias.id });
  return linha ?? null;
}

// D4/decisao 5: existe solicitacao ainda `agendada` neste caixa? Enquanto existir, o caixa nao
// fecha — a ordem da retaguarda precisa ser executada ou cancelada, nunca esquecida no fechamento.
export async function existeSolicitacaoAgendadaRepository(
  caixaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(and(eq(transferencias.caixaId, caixaId), eq(transferencias.status, "agendada"), daSolicitacaoCofre))
    .limit(1);
  return Boolean(linha);
}

// Decisao 7 (revisada): quem esta VINCULADO a esta conta e poderia conferir?
//
// Devolve so os candidatos estruturais — vinculo com a conta, empresa certa e diferente do criador
// (R-028: quem envia nao confirma o proprio envio). A ultima condicao, ter `transferencias_conferir`,
// NAO e resolvida aqui de proposito: a permissao efetiva vem de setor + cargos + usuario e e
// computada por `resolverPermissoesEfetivas`. Reproduzir isso em SQL criaria uma segunda regra de
// permissao, que divergiria da do guard no primeiro ajuste. O servico fecha a conta.
export async function listarCandidatosConfirmacaoRepository(
  // R-183 · uma LISTA de excluidos, e nao so o criador. Numa solicitacao D4 quem programa e quem
  // entrega sao pessoas diferentes, e as duas ficam impedidas de conferir (R-028). Este portao roda
  // ANTES de o dinheiro sair: se a exclusao das duas nao deixar ninguem elegivel, a entrega nao
  // acontece — melhor recusar a execucao do que descobrir depois que o malote nao tem conferente e
  // o caixa nao fecha mais.
  input: { contaId: string; empresaId: string; excluirUsuarioIds: Array<string | null> },
  db: ExecutorBanco = banco
): Promise<string[]> {
  const filtros = [eq(contasUsuarios.contaId, input.contaId), eq(contasUsuarios.empresaId, input.empresaId)];
  for (const usuarioId of input.excluirUsuarioIds) {
    if (usuarioId) filtros.push(ne(contasUsuarios.usuarioId, usuarioId));
  }

  const linhas = await db
    .select({ usuarioId: contasUsuarios.usuarioId })
    .from(contasUsuarios)
    .where(and(...filtros));
  return linhas.map((linha) => linha.usuarioId);
}

// Todas as transferencias de um caixa (aba TRANSFERENCIAS da planilha), com o lacre e a ordem.
export async function listarTransferenciasCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  return (
    db
      .select({
        id: transferencias.id,
        tipo: transferencias.tipo,
        ordem: transferencias.ordem,
        valorOriginal: transferencias.valorOriginal,
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId,
        // O lacre da linha e o numero digitado na propria transferencia (R-021: fonte externa).
        lacreNumero: transferencias.nLacreDoc,
        dataTransferencia: transferencias.dataTransferencia
      })
      .from(transferencias)
      .where(
        and(
          eq(transferencias.caixaId, caixaId),
          eq(transferencias.computar, true),
          // 'cancelada', no feminino: e o valor que `transferencias_status_check` aceita. O filtro
          // usava 'cancelado' (masculino, que so existe em vendas/despesas/retiradas/mercadorias) e
          // por isso nunca casava — inocuo enquanto nada era cancelado, e um vazamento assim que o
          // cancelamento passou a existir de verdade.
          ne(transferencias.status, "cancelada")
        )
      )
      // Cronologico: a "aba" numera 1a/2a/3a por ordem de acontecimento (abertura sem ordem entra 1a).
      .orderBy(asc(transferencias.criadoEm))
  );
}

export async function atualizarAberturaCaixaRepository(
  input: {
    caixaId: string;
    pdvId: string;
    usuarioCaixaId: string;
    colaboradorId: string;
    dataHoraAbertura: Date;
    observacao: string | null;
    tokenEdicao: string;
  },
  db: ExecutorBanco = banco
) {
  await db
    .update(fechamentosCaixa)
    .set({
      pdvId: input.pdvId,
      usuarioCaixaId: input.usuarioCaixaId,
      colaboradorId: input.colaboradorId,
      dataMovimento: diaNegocio(input.dataHoraAbertura),
      dataHoraAbertura: input.dataHoraAbertura,
      observacao: input.observacao,
      tokenEdicao: input.tokenEdicao
    })
    .where(eq(fechamentosCaixa.id, input.caixaId));
}

export async function registrarEdicaoCaixaRepository(
  input: {
    caixaId: string;
    tokenUsado: string | null;
    autorizadorId?: string | null;
    observacao?: string | null;
    editadoPor: string;
    valoresAntigos: Record<string, DadosExternos>;
    valoresNovos: Record<string, DadosExternos>;
  },
  db: ExecutorBanco = banco
) {
  await db.insert(edicoesCaixa).values(input);
}

// Auditoria de alteracoes de horario de UM caixa: quem editou, quando, motivo e quem autorizou.
// Dois joins na mesma tabela de perfis (editor e autorizador) exigem alias.
const perfilEditor = alias(perfisUsuarios, "perfil_editor");
const perfilAutorizador = alias(perfisUsuarios, "perfil_autorizador");

export async function listarEdicoesCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: edicoesCaixa.id,
      editadoPor: edicoesCaixa.editadoPor,
      editadoPorNome: perfilEditor.nome,
      autorizadorId: edicoesCaixa.autorizadorId,
      autorizadorNome: perfilAutorizador.nome,
      observacao: edicoesCaixa.observacao,
      editadoEm: edicoesCaixa.editadoEm,
      tokenUsado: edicoesCaixa.tokenUsado,
      valoresAntigos: edicoesCaixa.valoresAntigos,
      valoresNovos: edicoesCaixa.valoresNovos
    })
    .from(edicoesCaixa)
    .leftJoin(perfilEditor, eq(perfilEditor.usuarioId, edicoesCaixa.editadoPor))
    .leftJoin(perfilAutorizador, eq(perfilAutorizador.usuarioId, edicoesCaixa.autorizadorId))
    .where(eq(edicoesCaixa.caixaId, caixaId))
    .orderBy(desc(edicoesCaixa.editadoEm));
}

export async function listarAlteracoesPosFechamentoRepository(caixaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: alteracoesPosFechamentoCaixa.id,
      vendaId: alteracoesPosFechamentoCaixa.vendaId,
      alteradoEm: alteracoesPosFechamentoCaixa.alteradoEm,
      identificadorExterno: vendas.identificadorExterno,
      descricao: vendas.descricao,
      dataVenda: vendas.dataVenda,
      valor: vendas.valorOriginal
    })
    .from(alteracoesPosFechamentoCaixa)
    .innerJoin(vendas, eq(vendas.id, alteracoesPosFechamentoCaixa.vendaId))
    .where(eq(alteracoesPosFechamentoCaixa.fechamentoCaixaId, caixaId))
    .orderBy(desc(alteracoesPosFechamentoCaixa.alteradoEm));
}

// Lancamentos de UM caixa, por categoria. Mesmos criterios de calcularTotaisCaixaOperacionalRepository
// (computar + nao cancelado), para o detalhe bater com os totais da linha.
// Nao reusa /api/vendas e afins de proposito: aquelas rotas aplicam o escopo operacional
// "somente caixa aberto" e, para quem tem essa flag (cargo Caixa), trocariam o caixaId pedido pelo
// caixa aberto do proprio usuario — o detalhe mostraria o caixa errado.
export async function listarLancamentosCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  const ativo = (tabela: typeof vendas | typeof despesas | typeof retiradas | typeof mercadorias) =>
    and(eq(tabela.caixaId, caixaId), eq(tabela.computar, true), ne(tabela.status, "cancelado"));

  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias] = await Promise.all([
    db
      .select({
        id: vendas.id,
        descricao: vendas.descricao,
        data: vendas.dataReferencia,
        // Hora real da venda integrada; null em venda manual. A tela prefere ela a data contabil.
        dataHora: vendas.dataVenda,
        // Liquido: o detalhe tem de bater com a coluna Entradas, que soma liquido.
        valor: vendas.valorOriginal,
        valorDesconto: vendas.valorDesconto,
        valorAcrescimo: vendas.valorAcrescimo
      })
      .from(vendas)
      .where(ativo(vendas))
      .orderBy(desc(vendas.dataReferencia), desc(vendas.dataVenda)),
    db
      .select({
        id: transferencias.id,
        descricao: textoDoMovimento(transferencias),
        data: transferencias.dataReferencia,
        valor: transferencias.valorOriginal,
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId
      })
      .from(transferencias)
      .where(
        and(
          eq(transferencias.caixaId, caixaId),
          eq(transferencias.computar, true),
          // 'cancelada' (feminino) — ver a nota em listarTransferenciasCaixaRepository.
          ne(transferencias.status, "cancelada")
        )
      )
      .orderBy(desc(transferencias.dataReferencia)),
    db
      .select({
        id: despesas.id,
        descricao: textoDoMovimento(despesas),
        data: despesas.dataReferencia,
        valor: despesas.valorOriginal
      })
      .from(despesas)
      .where(ativo(despesas))
      .orderBy(desc(despesas.dataReferencia)),
    db
      .select({
        id: retiradas.id,
        descricao: textoDoMovimento(retiradas),
        data: retiradas.dataReferencia,
        valor: retiradas.valorOriginal
      })
      .from(retiradas)
      .where(ativo(retiradas))
      .orderBy(desc(retiradas.dataReferencia)),
    db
      .select({
        id: mercadorias.id,
        descricao: textoDoMovimento(mercadorias),
        data: mercadorias.dataReferencia,
        valor: mercadorias.valorOriginal
      })
      .from(mercadorias)
      .where(ativo(mercadorias))
      .orderBy(desc(mercadorias.dataReferencia))
  ]);

  return { linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias };
}

// Acerto de saldo do caixa (se houve): valor da diferenca e o colaborador que ficou com o debito.
export async function buscarAjusteCaixaRepository(caixaId: string, db: ExecutorBanco = banco) {
  const [ajuste] = await db
    .select({
      id: ajustesFechamentoCaixa.id,
      valorDiferenca: ajustesFechamentoCaixa.valorDiferenca,
      despesaId: ajustesFechamentoCaixa.despesaId,
      criadoEm: ajustesFechamentoCaixa.criadoEm,
      colaboradorId: debitosColaboradores.colaboradorId,
      colaboradorNome: colaboradores.nome,
      observacao: debitosColaboradores.observacao
    })
    .from(ajustesFechamentoCaixa)
    .leftJoin(debitosColaboradores, eq(debitosColaboradores.caixaId, ajustesFechamentoCaixa.fechamentoCaixaId))
    .leftJoin(colaboradores, eq(colaboradores.id, debitosColaboradores.colaboradorId))
    .where(eq(ajustesFechamentoCaixa.fechamentoCaixaId, caixaId))
    .orderBy(desc(ajustesFechamentoCaixa.criadoEm))
    .limit(1);
  return ajuste ?? null;
}

// Atualiza o horario de abertura e/ou fechamento (nao mexe em PDV/usuario/token) — usado pelo novo
// fluxo de alteracao por token/permissao. O tokenEdicao do gerente (fluxo antigo) fica intacto.
export async function atualizarHorarioCaixaRepository(
  input: { caixaId: string; dataHoraAbertura?: Date | undefined; dataHoraFechamento?: Date | undefined },
  db: ExecutorBanco = banco
) {
  const campos = {
    ...(input.dataHoraAbertura
      ? {
          dataHoraAbertura: input.dataHoraAbertura,
          dataMovimento: diaNegocio(input.dataHoraAbertura)
        }
      : {}),
    ...(input.dataHoraFechamento ? { dataHoraFechamento: input.dataHoraFechamento } : {})
  };
  if (Object.keys(campos).length === 0) return;
  await db.update(fechamentosCaixa).set(campos).where(eq(fechamentosCaixa.id, input.caixaId));
}

// Revinculacao retroativa das vendas INTEGRADAS ao caixa apos qualquer mudanca de horario.
// ANEXAR: vendas orfas (caixa_id NULL) do mesmo empresa+PDV com data_venda dentro do periodo.
// DESANEXAR: vendas DESTE caixa que ficaram fora do periodo voltam a orfas.
// Garantias: nunca toca venda de OUTRO caixa (anexar exige caixa_id NULL; desanexar filtra caixa_id
// = este) e nunca toca venda MANUAL (exige integracao_chave_id e data_venda preenchidos).
export async function revincularVendasAoCaixaRepository(
  input: { caixaId: string; empresaId: string; pdvId: string; abertura: Date; limiteSuperior: Date },
  db: ExecutorBanco = banco
): Promise<{ anexadas: number; desanexadas: number }> {
  const anexadas = await db
    .update(vendas)
    .set({ caixaId: input.caixaId })
    .where(
      and(
        eq(vendas.empresaId, input.empresaId),
        eq(vendas.pdvId, input.pdvId),
        isNull(vendas.caixaId),
        isNotNull(vendas.integracaoChaveId),
        isNotNull(vendas.dataVenda),
        gte(vendas.dataVenda, input.abertura),
        lte(vendas.dataVenda, input.limiteSuperior)
      )
    )
    .returning({ id: vendas.id });

  const desanexadas = await db
    .update(vendas)
    .set({ caixaId: null })
    .where(
      and(
        eq(vendas.caixaId, input.caixaId),
        isNotNull(vendas.integracaoChaveId),
        isNotNull(vendas.dataVenda),
        or(lt(vendas.dataVenda, input.abertura), gt(vendas.dataVenda, input.limiteSuperior))
      )
    )
    .returning({ id: vendas.id });

  return { anexadas: anexadas.length, desanexadas: desanexadas.length };
}

export async function caixaTemLancamentosRepository(caixaId: string, db: ExecutorBanco = banco) {
  const consultas = await Promise.all([
    db.select({ id: vendas.id }).from(vendas).where(eq(vendas.caixaId, caixaId)).limit(1),
    db.select({ id: transferencias.id }).from(transferencias).where(eq(transferencias.caixaId, caixaId)).limit(1),
    db.select({ id: despesas.id }).from(despesas).where(eq(despesas.caixaId, caixaId)).limit(1),
    db.select({ id: retiradas.id }).from(retiradas).where(eq(retiradas.caixaId, caixaId)).limit(1),
    db.select({ id: mercadorias.id }).from(mercadorias).where(eq(mercadorias.caixaId, caixaId)).limit(1)
  ]);
  return consultas.some((resultado) => resultado.length > 0);
}

export async function calcularTotaisCaixaOperacionalRepository(
  caixaId: string,
  pdvContaId: string,
  db: ExecutorBanco = banco
): Promise<TotaisCaixaCentavos> {
  const totais: TotaisCaixaCentavos = {
    entradas: 0,
    transferencias: 0,
    transferenciasEntrada: 0,
    transferenciasSaida: 0,
    despesas: 0,
    retiradas: 0,
    mercadorias: 0
  };

  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias] = await Promise.all([
    db
      // Desconto/acrescimo entram no liquido: valor_original e so o subtotal.
      .select({
        valorOriginal: vendas.valorOriginal,
        valorDesconto: vendas.valorDesconto,
        valorAcrescimo: vendas.valorAcrescimo
      })
      .from(vendas)
      .where(and(eq(vendas.caixaId, caixaId), eq(vendas.computar, true), ne(vendas.status, "cancelado"))),
    db
      .select({
        valorOriginal: transferencias.valorOriginal,
        // R-183: o que ENTROU. So a entrada usa este numero; a saida e sempre `valor_original`.
        valorRecebido: transferencias.valorRecebido,
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId,
        status: transferencias.status
      })
      .from(transferencias)
      .where(and(eq(transferencias.caixaId, caixaId), eq(transferencias.computar, true))),
    db
      .select({ valorOriginal: despesas.valorOriginal })
      .from(despesas)
      .where(and(eq(despesas.caixaId, caixaId), eq(despesas.computar, true), ne(despesas.status, "cancelado"))),
    db
      .select({ valorOriginal: retiradas.valorOriginal })
      .from(retiradas)
      .where(and(eq(retiradas.caixaId, caixaId), eq(retiradas.computar, true), ne(retiradas.status, "cancelado"))),
    db
      .select({ valorOriginal: mercadorias.valorOriginal })
      .from(mercadorias)
      .where(and(eq(mercadorias.caixaId, caixaId), eq(mercadorias.computar, true), ne(mercadorias.status, "cancelado")))
  ]);

  for (const movimento of linhasVendas) {
    totais.entradas += liquidoCentavos(movimento);
  }
  for (const movimento of linhasTransferencias) {
    // R-183 · DOIS numeros, e a separacao nao e estilo. A saida e sempre `valor_original` — o que
    // saiu do caixa nao muda porque o cofre contou menos. Usar um valor so para as duas pontas
    // devolveria a diferenca ao caixa, que e exatamente o que a regra proibe.
    const valorSaida = paraCentavos(movimento.valorOriginal);
    const valorEntrada = valorEntradaCentavos({
      valorOriginalCentavos: valorSaida,
      valorRecebidoCentavos: movimento.valorRecebido === null ? null : paraCentavos(movimento.valorRecebido)
    });
    if (transferenciaContaComoEntrada(movimento.status) && movimento.contaDestinoId === pdvContaId) {
      totais.transferencias += valorEntrada;
      totais.transferenciasEntrada += valorEntrada;
    }
    if (transferenciaContaComoSaida(movimento.status) && movimento.contaOrigemId === pdvContaId) {
      totais.transferencias += valorSaida;
      totais.transferenciasSaida += valorSaida;
    }
  }
  for (const movimento of linhasDespesas) {
    totais.despesas += paraCentavos(movimento.valorOriginal);
  }
  for (const movimento of linhasRetiradas) {
    totais.retiradas += paraCentavos(movimento.valorOriginal);
  }
  for (const movimento of linhasMercadorias) {
    totais.mercadorias += paraCentavos(movimento.valorOriginal);
  }

  return totais;
}

export async function atualizarFechamentoCaixaRepository(
  input: {
    caixaId: string;
    dataHoraFechamento: Date;
    observacao: string | null;
    fechadoPor: string;
    totais: TotaisCaixaCentavos;
    saldoCentavos: number;
  },
  db: ExecutorBanco = banco
): Promise<number> {
  const linhas = await db
    .update(fechamentosCaixa)
    .set({
      dataHoraFechamento: input.dataHoraFechamento,
      fechadoEm: new Date(),
      fechadoPor: input.fechadoPor,
      observacao: input.observacao,
      totalEntradas: centavosParaDecimalBanco(input.totais.entradas),
      totalTransferencias: centavosParaDecimalBanco(
        input.totais.transferenciasEntrada - input.totais.transferenciasSaida
      ),
      totalTransferenciasEntrada: centavosParaDecimalBanco(input.totais.transferenciasEntrada),
      totalTransferenciasSaida: centavosParaDecimalBanco(input.totais.transferenciasSaida),
      totalDespesas: centavosParaDecimalBanco(input.totais.despesas),
      totalRetiradas: centavosParaDecimalBanco(input.totais.retiradas),
      totalMercadorias: centavosParaDecimalBanco(input.totais.mercadorias),
      saldo: centavosParaDecimalBanco(input.saldoCentavos),
      status: "fechado"
    })
    // B1: a guarda `status = 'aberto'` no proprio UPDATE e o que impede o segundo fechamento
    // concorrente de sobrescrever fechado_por, fechado_em e os sete totais do primeiro. Quem
    // chama confere o retorno vazio e traduz para erro de dominio — nunca 500 cru.
    .where(and(eq(fechamentosCaixa.id, input.caixaId), eq(fechamentosCaixa.status, "aberto")))
    .returning({ id: fechamentosCaixa.id });
  return linhas.length;
}

export type FiltrosHistoricoCaixa = {
  empresaId: string;
  dataInicio?: string;
  dataFim?: string;
  pdvId?: string;
  usuarioCaixaId?: string;
  colaboradorId?: string;
  turnoId?: string;
  status?: string;
};

// Um unico WHERE para pagina, contagem e totais: se divergirem, o rodape mente sobre a lista.
function condicoesHistoricoCaixa(filtros: FiltrosHistoricoCaixa) {
  const condicoes = [eq(fechamentosCaixa.empresaId, filtros.empresaId)];
  if (filtros.dataInicio) condicoes.push(gte(fechamentosCaixa.dataMovimento, filtros.dataInicio));
  if (filtros.dataFim) condicoes.push(lte(fechamentosCaixa.dataMovimento, filtros.dataFim));
  if (filtros.pdvId) condicoes.push(eq(fechamentosCaixa.pdvId, filtros.pdvId));
  if (filtros.usuarioCaixaId) condicoes.push(eq(fechamentosCaixa.usuarioCaixaId, filtros.usuarioCaixaId));
  if (filtros.colaboradorId) condicoes.push(eq(fechamentosCaixa.colaboradorId, filtros.colaboradorId));
  if (filtros.turnoId) condicoes.push(eq(fechamentosCaixa.turnoId, filtros.turnoId));
  if (filtros.status) condicoes.push(eq(fechamentosCaixa.status, filtros.status));
  return and(...condicoes);
}

// Pagina do historico. Ordena por data_movimento (a data contabil que a tela filtra) e desempata
// pela abertura/PDV. tokenEdicao NAO sai daqui: e segredo do fluxo legado, nao dado de listagem.
export async function listarHistoricoCaixaRepository(
  filtros: FiltrosHistoricoCaixa,
  page: number,
  pageSize: number,
  db: ExecutorBanco = banco
) {
  const where = condicoesHistoricoCaixa(filtros);
  const itens = await db
    .select({
      id: fechamentosCaixa.id,
      empresaId: fechamentosCaixa.empresaId,
      dataMovimento: fechamentosCaixa.dataMovimento,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      usuarioCaixaId: fechamentosCaixa.usuarioCaixaId,
      usuarioCaixaNome: perfisUsuarios.nome,
      colaboradorId: fechamentosCaixa.colaboradorId,
      colaboradorNome: colaboradores.nome,
      turnoId: fechamentosCaixa.turnoId,
      turnoNome: turnos.nome,
      dataHoraAbertura: fechamentosCaixa.dataHoraAbertura,
      dataHoraFechamento: fechamentosCaixa.dataHoraFechamento,
      fechadoPor: fechamentosCaixa.fechadoPor,
      fechadoPorNome: perfilFechador.nome,
      observacao: fechamentosCaixa.observacao,
      totalEntradas: fechamentosCaixa.totalEntradas,
      totalTransferencias: fechamentosCaixa.totalTransferencias,
      totalTransferenciasEntrada: fechamentosCaixa.totalTransferenciasEntrada,
      totalTransferenciasSaida: fechamentosCaixa.totalTransferenciasSaida,
      totalDespesas: fechamentosCaixa.totalDespesas,
      totalRetiradas: fechamentosCaixa.totalRetiradas,
      totalMercadorias: fechamentosCaixa.totalMercadorias,
      saldo: fechamentosCaixa.saldo,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, fechamentosCaixa.usuarioCaixaId))
    .leftJoin(perfilFechador, eq(perfilFechador.usuarioId, fechamentosCaixa.fechadoPor))
    .leftJoin(colaboradores, eq(colaboradores.id, fechamentosCaixa.colaboradorId))
    .leftJoin(turnos, eq(turnos.id, fechamentosCaixa.turnoId))
    .where(where)
    .orderBy(desc(fechamentosCaixa.dataMovimento), desc(fechamentosCaixa.dataHoraAbertura), asc(pdvs.nome))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [contagem] = await db.select({ total: count() }).from(fechamentosCaixa).where(where);
  return { itens, total: contagem?.total ?? 0 };
}

// Totais do FILTRO INTEIRO (nao da pagina) — e o que o rodape promete. Soma as colunas ja
// persistidas em fechamentos_caixa; nada e recalculado a partir dos lancamentos.
export async function totaisHistoricoCaixaRepository(filtros: FiltrosHistoricoCaixa, db: ExecutorBanco = banco) {
  const [totais] = await db
    .select({
      totalEntradas: sum(fechamentosCaixa.totalEntradas),
      totalTransferenciasEntrada: sum(fechamentosCaixa.totalTransferenciasEntrada),
      totalTransferenciasSaida: sum(fechamentosCaixa.totalTransferenciasSaida),
      totalDespesas: sum(fechamentosCaixa.totalDespesas),
      totalRetiradas: sum(fechamentosCaixa.totalRetiradas),
      totalMercadorias: sum(fechamentosCaixa.totalMercadorias),
      saldo: sum(fechamentosCaixa.saldo),
      caixas: count()
    })
    .from(fechamentosCaixa)
    .where(condicoesHistoricoCaixa(filtros));
  return totais ?? null;
}

// Quais caixas tiveram acerto de saldo. O status "ajustado" existe na constraint mas nenhum fluxo
// o escreve; a verdade sobre "houve acerto" e a existencia da linha em ajustes_fechamento_caixa.
export async function caixasComAjusteRepository(caixaIds: string[], db: ExecutorBanco = banco) {
  if (!caixaIds.length) return [];
  return db
    .selectDistinct({ caixaId: ajustesFechamentoCaixa.fechamentoCaixaId })
    .from(ajustesFechamentoCaixa)
    .where(inArray(ajustesFechamentoCaixa.fechamentoCaixaId, caixaIds));
}

export async function caixasAlteradosPosFechamentoRepository(caixaIds: string[], db: ExecutorBanco = banco) {
  if (!caixaIds.length) return [];
  return db
    .selectDistinct({ caixaId: alteracoesPosFechamentoCaixa.fechamentoCaixaId })
    .from(alteracoesPosFechamentoCaixa)
    .where(inArray(alteracoesPosFechamentoCaixa.fechamentoCaixaId, caixaIds));
}

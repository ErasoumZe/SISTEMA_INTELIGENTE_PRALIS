import { and, count, desc, eq, exists, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contas, empresas, pdvs, perfisUsuarios, turnos } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import { lacres, transferencias, transferenciasDestinosCandidatos } from "@padaria/db/schema/transferencia";
import type { TransferenciaDto, TransferenciasQuery } from "@padaria/shared/transferencias";
import { banco } from "../banco/conexao.js";
import { ehRetornoDoCaixa } from "./entrega-cofre.repository.js";
import { filtrosEmpresa, numeroDecimal } from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";
import { derivarSituacaoMalote, escaparCuringasLike, montarLacresDaLinha } from "./relatorio-lacres.js";

export type OpcoesListagemTransferencias = {
  page: number;
  pageSize: number;
  // false = oculta o numero dos lacres ainda nao rompidos (fechamento e bolsas). Decidido na borda
  // pelo perfil; este repositorio so executa.
  mostrarNumerosLacre: boolean;
};

/**
 * Lista de Transferencias da Tesouraria (relatorio). Paginada NO BANCO: o corte em memoria que existia
 * trazia todas as linhas da empresa a cada pagina e estouraria o limite de parametros do Postgres
 * quando os detalhes (lacres, PDVs, caixa) fossem buscados em lote. Os detalhes sao buscados SO para
 * as linhas da pagina (<= 100).
 */
export async function listarTransferenciasRepository(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null,
  opcoes: OpcoesListagemTransferencias
): Promise<{ itens: TransferenciaDto[]; total: number }> {
  const origem = alias(contas, "conta_origem");
  const destino = alias(contas, "conta_destino");
  const criador = alias(perfisUsuarios, "perfil_criador_transferencia");
  const pdvDaConta = alias(pdvs, "pdv_da_conta_destino");
  const pdvCandidato = alias(pdvs, "pdv_candidato");

  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(transferencias.caixaId, query.caixaId));
  if (query.status) filtros.push(eq(transferencias.status, query.status));
  if (query.dataInicio) filtros.push(gte(transferencias.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(transferencias.dataReferencia, query.dataFim));
  if (query.usuario) filtros.push(ilike(criador.nome, `%${escaparCuringasLike(query.usuario)}%`));
  if (query.contaOrigemId) filtros.push(eq(transferencias.contaOrigemId, query.contaOrigemId));
  if (query.contaDestinoId) filtros.push(eq(transferencias.contaDestinoId, query.contaDestinoId));

  if (query.pdvId) {
    // PDV = o do caixa que usou a transferencia OU o PDV PREVISTO. Malote ainda nao usado nao tem caixa,
    // e antes disso o filtro por PDV o escondia. O previsto vem da conta de destino e dos candidatos do
    // multiplo destino (`transferencias.conta_destino_id` guarda so o primeiro). `EXISTS` e nao JOIN:
    // `pdvs.conta_id` nao e unico e um JOIN 1:N duplicaria a linha e inflaria o total.
    const pdvId = query.pdvId;
    filtros.push(
      or(
        eq(fechamentosCaixa.pdvId, pdvId),
        exists(
          banco
            .select({ id: pdvDaConta.id })
            .from(pdvDaConta)
            .where(and(eq(pdvDaConta.id, pdvId), eq(pdvDaConta.contaId, transferencias.contaDestinoId)))
        ),
        exists(
          banco
            .select({ id: pdvCandidato.id })
            .from(transferenciasDestinosCandidatos)
            .innerJoin(pdvCandidato, eq(pdvCandidato.contaId, transferenciasDestinosCandidatos.contaId))
            .where(
              and(eq(transferenciasDestinosCandidatos.transferenciaId, transferencias.id), eq(pdvCandidato.id, pdvId))
            )
        )
      ) as SQL
    );
  }

  if (query.lacre) {
    // Procura em TODOS os lacres da transferencia (abertura, bolsas de sangria, fechamento) e escapa
    // `%` e `_`: sem isso, digitar `%` casava qualquer lacre (D-14 do brain).
    const padrao = `%${escaparCuringasLike(query.lacre)}%`;
    filtros.push(
      or(
        ilike(transferencias.nLacreDoc, padrao),
        exists(
          banco
            .select({ id: lacres.id })
            .from(lacres)
            .where(
              and(
                eq(lacres.empresaId, transferencias.empresaId),
                ilike(lacres.numero, padrao),
                // Quem nao ve o numero (fechamento e bolsas ainda lacrados) tambem nao pode DESCOBRI-LO
                // pelo filtro: sem isto, `?lacre=1`, `?lacre=12`... revelava o numero oculto por tentativa.
                ...(opcoes.mostrarNumerosLacre ? [] : [eq(lacres.rompido, true)]),
                or(
                  eq(lacres.transferenciaId, transferencias.id),
                  eq(lacres.transferenciaDistribuicaoId, transferencias.id)
                )
              )
            )
        )
      ) as SQL
    );
  }

  const where = filtros.length ? and(...filtros) : undefined;

  const [contagem] = await banco
    .select({ total: count() })
    .from(transferencias)
    .leftJoin(fechamentosCaixa, eq(fechamentosCaixa.id, transferencias.caixaId))
    .leftJoin(criador, eq(criador.usuarioId, transferencias.criadoPor))
    .where(where);
  const total = Number(contagem?.total ?? 0);

  const linhas = await banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: textoDoMovimento(transferencias),
      valorOriginal: transferencias.valorOriginal,
      valorRecebido: transferencias.valorRecebido,
      valorEspecieDeclarado: transferencias.valorEspecieDeclarado,
      valorMoedasDeclarado: transferencias.valorMoedasDeclarado,
      computar: transferencias.computar,
      status: transferencias.status,
      contaOrigemId: transferencias.contaOrigemId,
      contaDestinoId: transferencias.contaDestinoId,
      contaOrigemNome: origem.nome,
      contaDestinoNome: destino.nome,
      nLacreDoc: transferencias.nLacreDoc,
      prazoConfirmacaoEm: transferencias.prazoConfirmacaoEm,
      dataRecebimento: transferencias.dataRecebimento,
      confirmadoPor: transferencias.confirmadoPor,
      criadoPor: transferencias.criadoPor,
      criadoPorNome: criador.nome,
      criadoEm: transferencias.criadoEm,
      observacao: transferencias.observacao,
      // Os ingredientes do predicado canonico. Vem crus para a borda decidir uma vez so,
      // com a MESMA regra de `buscarContextoConferenciaRepository` — ver `ehCaixaParaCofre`.
      caixaId: transferencias.caixaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      planejamentoOrigemTransferenciaId: transferencias.planejamentoOrigemTransferenciaId,
      tipo: transferencias.tipo,
      caixaStatus: fechamentosCaixa.status,
      caixaAbertoEm: fechamentosCaixa.dataHoraAbertura,
      caixaOperadorNome: fechamentosCaixa.caixaResponsavelNomeAbertura,
      caixaSupervisorNome: fechamentosCaixa.supervisorResponsavelNomeAbertura,
      caixaLacreFechamento: fechamentosCaixa.lacreFechamento,
      turnoNome: turnos.nome
    })
    .from(transferencias)
    .innerJoin(origem, eq(origem.id, transferencias.contaOrigemId))
    .innerJoin(destino, eq(destino.id, transferencias.contaDestinoId))
    .innerJoin(empresas, eq(empresas.id, transferencias.empresaId))
    .leftJoin(fechamentosCaixa, eq(fechamentosCaixa.id, transferencias.caixaId))
    .leftJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    // `turno_id` nao valida a empresa no insert: o join exige o par (id, empresa_id).
    .leftJoin(turnos, and(eq(turnos.id, fechamentosCaixa.turnoId), eq(turnos.empresaId, fechamentosCaixa.empresaId)))
    .leftJoin(criador, eq(criador.usuarioId, transferencias.criadoPor))
    .where(where)
    // Historico: o lancamento mais recente primeiro. `id` desempata para a paginacao ser estavel.
    .orderBy(desc(transferencias.criadoEm), desc(transferencias.id))
    .limit(opcoes.pageSize)
    .offset((opcoes.page - 1) * opcoes.pageSize);

  if (linhas.length === 0) return { itens: [], total };

  const ids = linhas.map((linha) => linha.id);
  const empresaIds = [...new Set(linhas.map((linha) => linha.empresaId))];
  const contasDestinoIds = [...new Set(linhas.map((linha) => linha.contaDestinoId))];

  const [paisComPlanejamento, lacresDaPagina, pdvsPorConta, pdvsCandidatos] = await Promise.all([
    banco
      .select({ id: transferencias.planejamentoOrigemTransferenciaId })
      .from(transferencias)
      .where(inArray(transferencias.planejamentoOrigemTransferenciaId, ids)),
    banco
      .select({
        numero: lacres.numero,
        origem: lacres.origem,
        transferenciaId: lacres.transferenciaId,
        transferenciaDistribuicaoId: lacres.transferenciaDistribuicaoId,
        rompido: lacres.rompido
      })
      .from(lacres)
      .where(
        and(
          inArray(lacres.empresaId, empresaIds),
          or(inArray(lacres.transferenciaId, ids), inArray(lacres.transferenciaDistribuicaoId, ids))
        )
      ),
    banco
      .select({ contaId: pdvs.contaId, nome: pdvs.nome })
      .from(pdvs)
      .where(and(inArray(pdvs.empresaId, empresaIds), inArray(pdvs.contaId, contasDestinoIds), eq(pdvs.ativo, true))),
    banco
      .select({ transferenciaId: transferenciasDestinosCandidatos.transferenciaId, nome: pdvs.nome })
      .from(transferenciasDestinosCandidatos)
      .innerJoin(
        pdvs,
        and(
          eq(pdvs.contaId, transferenciasDestinosCandidatos.contaId),
          eq(pdvs.empresaId, transferenciasDestinosCandidatos.empresaId)
        )
      )
      .where(and(inArray(transferenciasDestinosCandidatos.transferenciaId, ids), eq(pdvs.ativo, true)))
  ]);

  const idsPaisComPlanejamento = new Set(paisComPlanejamento.map((linha) => linha.id).filter(Boolean));
  const nomesPorConta = new Map<string, string[]>();
  for (const pdv of pdvsPorConta) nomesPorConta.set(pdv.contaId, [...(nomesPorConta.get(pdv.contaId) ?? []), pdv.nome]);
  const nomesPorCandidato = new Map<string, string[]>();
  for (const pdv of pdvsCandidatos) {
    nomesPorCandidato.set(pdv.transferenciaId, [...(nomesPorCandidato.get(pdv.transferenciaId) ?? []), pdv.nome]);
  }

  const itens = linhas.map((linha): TransferenciaDto => {
    const {
      tipo,
      planejamentoOrigemTransferenciaId,
      caixaStatus,
      caixaAbertoEm,
      caixaOperadorNome,
      caixaSupervisorNome,
      caixaLacreFechamento,
      turnoNome,
      ...base
    } = linha;
    const pdvsDestino = [
      ...new Set([...(nomesPorConta.get(linha.contaDestinoId) ?? []), ...(nomesPorCandidato.get(linha.id) ?? [])])
    ].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    const ehPlanejamentoRetorno = planejamentoOrigemTransferenciaId !== null;
    return {
      ...base,
      status: linha.status as TransferenciaDto["status"],
      valorRecebido: linha.valorRecebido === null ? null : numeroDecimal(linha.valorRecebido),
      valorEspecieDeclarado: linha.valorEspecieDeclarado === null ? null : numeroDecimal(linha.valorEspecieDeclarado),
      valorMoedasDeclarado: linha.valorMoedasDeclarado === null ? null : numeroDecimal(linha.valorMoedasDeclarado),
      prazoConfirmacaoEm: linha.prazoConfirmacaoEm?.toISOString() ?? null,
      dataRecebimento: linha.dataRecebimento?.toISOString() ?? null,
      criadoEm: linha.criadoEm.toISOString(),
      ehCaixaParaCofre: ehRetornoDoCaixa({ caixaId: linha.caixaId, tipo }),
      ehPlanejamentoRetorno,
      possuiPlanejamentoRetorno: idsPaisComPlanejamento.has(linha.id),
      tipoMovimento: tipo as TransferenciaDto["tipoMovimento"],
      situacaoMalote: derivarSituacaoMalote({
        tipo,
        status: linha.status,
        caixaId: linha.caixaId,
        ehPlanejamentoRetorno,
        pdvsDestino
      }),
      pdvsDestino,
      lacres: montarLacresDaLinha(
        {
          id: linha.id,
          tipo,
          status: linha.status,
          caixaId: linha.caixaId,
          nLacreDoc: linha.nLacreDoc,
          ehPlanejamentoRetorno,
          lacreFechamentoDoCaixa: caixaLacreFechamento,
          pdvsDestino
        },
        lacresDaPagina,
        opcoes.mostrarNumerosLacre
      ),
      caixa: linha.caixaId
        ? {
            id: linha.caixaId,
            status: caixaStatus ?? "",
            pdvNome: linha.pdvNome,
            turnoNome,
            operadorNome: caixaOperadorNome,
            supervisorNome: caixaSupervisorNome,
            abertoEm: caixaAbertoEm?.toISOString() ?? null
          }
        : null
    };
  });

  return { itens, total };
}

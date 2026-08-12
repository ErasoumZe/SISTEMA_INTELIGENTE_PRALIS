import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  ConfirmarTransferenciaPayload,
  RecusarConferenciaPayload,
  TempoConfirmacao,
  TransferenciaCriada,
  TransferenciaDetalheDto,
  TransferenciaDto,
  TransferenciaPayload,
  TransferenciasQuery
} from "@padaria/shared/transferencias";
import { ErroDominio, erroValidacao } from "../erros.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  buscarCaixaPorIdRepository,
  listarUsuariosTesourariaRepository,
  travarCaixaCompartilhadoRepository
} from "../caixa/caixa.repository.js";
import { travarCaixaAbertoDoAtor } from "../caixa/caixa.service.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { existeNumeroLacreRepository } from "../lacres/lacres.repository.js";
import { paraCentavos } from "@padaria/shared/dinheiro";
import {
  exigirContaForaDoCaixaFechadoNaCorrida,
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  podeLancarSemCaixa
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasTransferencia
} from "../lancamentos/lancamentos.dominio.js";
// R-127: a transferencia nao tem data de pagamento (a R-129 nao a alcanca), mas TEM texto — e o
// contrato dela afrouxou junto com o dos outros tres. Sem este passo, transferencia sem texto
// nenhum passaria a ser aceita, que e o oposto do que a regra pediu.
import { resolverObservacaoDoLancamento } from "../lancamentos/texto-movimento.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import {
  atualizarTransferenciaRepository,
  buscarContextoConferenciaRepository,
  buscarTransferenciaDetalheRepository,
  travarTransferenciaRepository,
  confirmarTransferenciaRepository,
  contasPertencemEmpresaRepository,
  criarTransferenciaRepository,
  efetivarTransferenciaAgendadaRepository,
  listarAgendadasVencidasRepository,
  ehConfirmadorElegivelRepository,
  liberarTravaTransferenciaRepository,
  listarDestinatariosTransferenciaRepository,
  listarTransferenciasVencidasRepository,
  listarTransferenciasRepository,
  registrarRecusaConferenciaRepository
} from "./transferencias.repository.js";

export function validarTransferencia(dados: TransferenciaPayload): void {
  if (dados.contaOrigemId === dados.contaDestinoId) throw new Error("Conta de destino deve ser diferente da origem");
  if (!dados.nLacreDoc?.trim()) throw new Error("Numero do lacre/documento e obrigatorio");
  if (dados.contasDestinoIds.includes(dados.contaOrigemId)) {
    throw new Error("A conta de origem nao pode ser destino candidato");
  }
  if (dados.agendadaPara && new Date(dados.agendadaPara).getTime() <= Date.now()) {
    throw new Error("Agendamento precisa estar no futuro");
  }
}

function normalizarCargo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

export async function listarTransferencias(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarTransferenciasRepository(query, empresasPermitidasIds);
}

export async function criarTransferencia(
  dados: TransferenciaPayload,
  perfil: PerfilUsuario
): Promise<TransferenciaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_criar");
  validarTransferencia(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  try {
    return await executarEmTransacao(async (tx) => {
      const lacreExistente = await existeNumeroLacreRepository(dados.empresaId, dados.nLacreDoc!, tx);
      if (lacreExistente) throw new Error("Lacre ja utilizado em outro movimento");
      const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
      if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
      const contasValidas = await contasPertencemEmpresaRepository(
        [dados.contaOrigemId, dados.contaDestinoId, ...dados.contasDestinoIds],
        dados.empresaId,
        tx
      );
      if (!contasValidas) throw new Error("Conta de origem ou destino nao pertence a empresa informada");

      const transferenciaLivre = podeLancarSemCaixa(perfil);
      // P0: o caixa do ator chega TRAVADO (FOR SHARE) e revalidado — mesma porta unica das saidas.
      const { caixa, caixaFechadoNaCorrida } = transferenciaLivre
        ? await travarCaixaAbertoDoAtor(dados.empresaId, perfil.usuarioId, tx)
        : { caixa: await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx), caixaFechadoNaCorrida: null };
      // Q2: na transferencia a conta do PDV vale como origem OU destino (dinheiro entra e sai).
      exigirContaForaDoCaixaFechadoNaCorrida(caixaFechadoNaCorrida, dados.contaOrigemId, dados.contaDestinoId);
      const envolveContaPdv =
        caixa && (dados.contaOrigemId === caixa.pdvContaId || dados.contaDestinoId === caixa.pdvContaId);
      if (!transferenciaLivre && !envolveContaPdv) {
        throw new Error("Transferencia do operador Caixa precisa envolver a conta do PDV aberto");
      }

      const transferencia = await criarTransferenciaRepository(
        resolverObservacaoDoLancamento(dados),
        computar,
        perfil.usuarioId,
        envolveContaPdv ? caixa.id : null,
        tx
      );
      return { id: transferencia.id, computar };
    });
  } catch (error) {
    const banco = error as Error & { code?: string; constraint?: string };
    if (banco.code === "23505" && banco.constraint === "lacres_numero_unico") {
      throw new Error("Lacre ja utilizado em outro movimento", { cause: error });
    }
    throw error;
  }
}

export async function confirmarTransferencia(
  transferenciaId: string,
  dados: ConfirmarTransferenciaPayload,
  perfil: PerfilUsuario
) {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_conferir");
  return executarEmTransacao(async (tx) => {
    const existente = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.status !== "pendente") throw new Error("Transferencia nao esta pendente de confirmacao");

    // Q4 (Jose, 11/08/2026): confirmacao que ALTERARIA entrada ou saida de caixa ja fechado e
    // bloqueada imediatamente; fluxo auditado futuro e outra OS. Mecanica: confirmar muda
    // `pendente -> recebido` e grava a conta destino vencedora — a ENTRADA do caixa do
    // `caixa_id` passa a contar se essa conta for a do PDV dele (shared/caixa/regras). A SAIDA
    // nunca muda aqui (pendente e recebido contam igual) — por isso o retorno/sangria ao cofre,
    // confirmado depois do fechamento, continua passando: ele nao altera total nenhum.
    //
    // Ordem unica do P0: o caixa (FOR SHARE) vem ANTES do UPDATE na transferencia. Com o caixa
    // ABERTO, o lock tambem serializa com o fechamento em voo — quem confirmar primeiro entra nos
    // totais; quem perder a corrida cai na recusa abaixo.
    if (existente.caixaId) {
      const trava = await travarCaixaCompartilhadoRepository(existente.caixaId, tx);
      if (trava?.status !== "aberto") {
        const caixa = await buscarCaixaPorIdRepository(existente.caixaId, tx);
        if (caixa?.pdvContaId && dados.contaDestinoId === caixa.pdvContaId) {
          throw new Error("Caixa ja fechado");
        }
      }
    }

    // Decisao 5 · o fluxo Caixa -> Cofre e ESTRITO, e so ele. `/confirmar` passa a significar
    // "conferi e bateu": exige o valor contado e recusa qualquer divergencia, sem confirmar nada.
    // A divergencia tem endpoint proprio (`/recusar-conferencia`), porque precisa ser COMMITADA
    // com motivo — e um erro aqui derrubaria a transacao junto com o registro.
    //
    // Transferencia generica NAO entra neste ramo: la o comportamento vigente e preservado
    // (valor opcional, divergencia confirma e notifica).
    const contexto = await buscarContextoConferenciaRepository(transferenciaId, tx);
    if (contexto?.ehCaixaParaCofre) {
      if (dados.valorRecebido == null) {
        throw erroValidacao(
          "Informe o valor recebido para conferir uma entrega do Caixa",
          "VALOR_RECEBIDO_OBRIGATORIO"
        );
      }
      const divergeValor = paraCentavos(dados.valorRecebido) !== contexto.valorCentavos;
      const divergeLacre = (contexto.lacre ?? null) !== (dados.nLacreDoc?.trim() || null);
      if (divergeValor || divergeLacre) {
        throw new ErroDominio(
          "Conferencia divergente: registre a recusa com o motivo em /recusar-conferencia",
          409,
          "CONFERENCIA_DIVERGENTE"
        );
      }
    }

    const confirmada = await confirmarTransferenciaRepository(transferenciaId, dados, perfil.usuarioId, tx);
    if (!confirmada) throw new Error("Somente operador de uma conta destino pode confirmar uma unica vez");

    // Caminho GENERICO preservado: divergencia de valor confirma e notifica, como sempre foi.
    // O ramo estrito acima ja saiu com 409, entao esta notificacao nunca dispara para Caixa -> Cofre.
    if (dados.valorRecebido != null && paraCentavos(dados.valorRecebido) !== paraCentavos(existente.valorOriginal)) {
      const tesouraria = await listarUsuariosTesourariaRepository(existente.empresaId, tx);
      await criarNotificacoesRepository(
        {
          empresaId: existente.empresaId,
          tipo: "transferencia_divergencia",
          destinatariosUsuarioIds: [
            ...new Set([
              perfil.usuarioId,
              ...tesouraria.map((item) => item.usuarioId).filter((id): id is string => Boolean(id))
            ])
          ],
          referenciaId: transferenciaId,
          titulo: `Divergencia na transferencia ${existente.nLacreDoc ?? transferenciaId}`,
          valorCentavos: paraCentavos(dados.valorRecebido) - paraCentavos(existente.valorOriginal)
        },
        tx
      );
    }
    return { id: confirmada.id };
  });
}

// Decisao 8 · RECUSA auditavel de conferencia — exclusiva do fluxo Caixa -> Cofre.
//
// O que este endpoint NAO faz, e por que:
//   - nao confirma: o dinheiro conferido nao bateu;
//   - nao cancela: cancelar e ato da retaguarda sobre solicitacao `agendada`, nao da conferencia;
//   - nao lanca excecao depois de gravar: a excecao faria rollback do registro auditavel, que e
//     exatamente o que precisa sobreviver. Por isso o desfecho e um 200 explicito de "divergencia
//     registrada", nunca um sucesso de confirmacao.
// A transferencia continua `pendente`, pronta para reconferencia depois que a divergencia for
// resolvida no mundo real.
export async function recusarConferencia(
  transferenciaId: string,
  dados: RecusarConferenciaPayload,
  perfil: PerfilUsuario
): Promise<{ registrada: true; transferenciaId: string; tentativas: number }> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_conferir");
  return executarEmTransacao(async (tx) => {
    const contexto = await buscarContextoConferenciaRepository(transferenciaId, tx);
    if (!contexto || !podeAcessarEmpresa(perfil, contexto.empresaId)) throw new Error("Registro nao encontrado");
    // Generica nao tem recusa auditavel: para ela isto e 404, e nao "nao pode" — o caminho dela
    // continua sendo o `/confirmar` com a regra vigente.
    if (!contexto.ehCaixaParaCofre) throw new Error("Registro nao encontrado");
    if (contexto.status !== "pendente") throw new Error("Transferencia nao esta pendente de confirmacao");

    // Mesma elegibilidade da confirmacao: vinculado a conta destino, e nunca quem criou o movimento
    // (R-028). Sem isso, quem enviou o dinheiro poderia "recusar" a propria entrega.
    const elegivel = await ehConfirmadorElegivelRepository(
      { transferenciaId, contaId: dados.contaDestinoId, usuarioId: perfil.usuarioId },
      tx
    );
    if (!elegivel) throw new Error("Somente operador de uma conta destino pode conferir esta transferencia");

    const registro = await registrarRecusaConferenciaRepository(
      {
        transferenciaId,
        recusadoPor: perfil.usuarioId,
        motivo: dados.motivo.trim(),
        lacreInformado: dados.nLacreDoc?.trim() || null,
        valorInformadoCentavos: dados.valorRecebido == null ? null : paraCentavos(dados.valorRecebido)
      },
      tx
    );

    // Quem precisa saber: quem ENTREGOU (o executor real da solicitacao D4, ou o criador quando a
    // entrega foi avulsa/retorno final) mais a Tesouraria/Gestao. Usar so `criado_por` numa
    // solicitacao programada avisaria quem programou e deixaria o operador no escuro.
    const operador = contexto.executadoPor ?? contexto.criadoPor;
    const tesouraria = await listarUsuariosTesourariaRepository(contexto.empresaId, tx);
    const destinatarios = [
      ...new Set([operador, ...tesouraria.map((item) => item.usuarioId)].filter((id): id is string => Boolean(id)))
    ];
    await criarNotificacoesRepository(
      {
        empresaId: contexto.empresaId,
        tipo: "transferencia_divergencia",
        destinatariosUsuarioIds: destinatarios,
        referenciaId: transferenciaId,
        titulo: `Conferencia recusada (${registro.tentativas}a tentativa) - ${contexto.lacre ?? transferenciaId}`,
        valorCentavos: dados.valorRecebido == null ? null : paraCentavos(dados.valorRecebido) - contexto.valorCentavos,
        // Cada nova tentativa reabre a pendencia: sem isto, quem ja tinha marcado a primeira
        // recusa como vista nunca seria avisado da segunda.
        reabrir: true
      },
      tx
    );

    return { registrada: true, transferenciaId, tentativas: registro.tentativas };
  });
}

export async function processarTransferenciasTemporais(agora = new Date()) {
  await executarEmTransacao(async (tx) => {
    // S1 (R-164, Jose 11/08): efetivar `agendada -> pendente` altera a SAIDA do caixa da linha,
    // entao cada agendada com caixa entra na porta — FOR SHARE + revalidacao. Caixa aberto:
    // efetiva; caixa FECHADO: nao altera status nem totais (a linha permanece agendada e sera
    // reavaliada nos proximos ciclos). A lista vem em ordem deterministica (caixa_id, id) para os
    // locks de varios caixas sairem sempre na mesma ordem — sem ciclo com o fechamento, que trava
    // um unico caixa.
    const agendadasVencidas = await listarAgendadasVencidasRepository(agora, tx);
    // Cada caixa e travado/revalidado UMA vez (mesmo desenho do cancelamento de serie): o veredito
    // vale para a transacao inteira porque o FOR SHARE impede o caixa de fechar ate o commit.
    const caixaAbertoPorId = new Map<string, boolean>();
    for (const agendada of agendadasVencidas) {
      if (agendada.caixaId) {
        let aberto = caixaAbertoPorId.get(agendada.caixaId);
        if (aberto === undefined) {
          const trava = await travarCaixaCompartilhadoRepository(agendada.caixaId, tx);
          aberto = trava?.status === "aberto";
          caixaAbertoPorId.set(agendada.caixaId, aberto);
        }
        if (!aberto) continue;
      }
      await efetivarTransferenciaAgendadaRepository(
        agendada.id,
        (agendada.tempoConfirmacao ?? "1dia") as TempoConfirmacao,
        agora,
        tx
      );
    }
    const vencidas = await listarTransferenciasVencidasRepository(agora, tx);
    for (const transferencia of vencidas) {
      const destinatarios = await listarDestinatariosTransferenciaRepository(transferencia.id, tx);
      await criarNotificacoesRepository(
        {
          empresaId: transferencia.empresaId,
          tipo: "transferencia_prazo_confirmacao",
          destinatariosUsuarioIds: [
            ...new Set(
              [transferencia.criadoPor, ...destinatarios.map((item) => item.usuarioId)].filter((id): id is string =>
                Boolean(id)
              )
            )
          ],
          referenciaId: transferencia.id,
          titulo: "Prazo de confirmacao de transferencia estourado",
          valorCentavos: paraCentavos(transferencia.valor)
        },
        tx
      );
    }
  });
}

export function podeLiberarTravaTransferencia(perfil: PerfilUsuario) {
  if (perfil.role === "admin" || perfil.role === "usuario_admin") return true;
  return perfil.cargos.some((cargo) => {
    const nome = normalizarCargo(cargo.nome);
    return nome.startsWith("tesouraria") || nome.startsWith("gerencia") || nome.startsWith("gerente");
  });
}

export async function liberarTravaTransferencia(transferenciaId: string, perfil: PerfilUsuario) {
  if (!podeLiberarTravaTransferencia(perfil)) throw new Error("Somente Tesouraria, Gerencia ou Admin pode liberar");
  const transferencia = await obterTransferencia(transferenciaId, perfil);
  if (transferencia.status !== "pendente") throw new Error("Transferencia nao esta pendente");
  const item = await liberarTravaTransferenciaRepository(transferenciaId, perfil.usuarioId);
  if (!item) throw new Error("Trava ja liberada ou transferencia inexistente");
  return item;
}

export async function obterTransferencia(
  transferenciaId: string,
  perfil: PerfilUsuario
): Promise<TransferenciaDetalheDto> {
  const transferencia = await buscarTransferenciaDetalheRepository(transferenciaId);
  if (!transferencia || !podeAcessarEmpresa(perfil, transferencia.empresaId)) {
    throw new Error("Registro nao encontrado");
  }
  return transferencia;
}

export async function atualizarTransferencia(
  transferenciaId: string,
  dados: TransferenciaPayload,
  perfil: PerfilUsuario
): Promise<TransferenciaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_editar");
  validarTransferencia(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  return executarEmTransacao(async (tx) => {
    // Leitura sem lock so para o 404/empresa vir antes dos erros de caixa, como sempre foi.
    const previa = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    // P0 — ordem unica: caixa (FOR SHARE, dentro da validacao) ANTES da linha da transferencia.
    const caixa = await validarEdicaoNoCaixaAberto(previa, dados, perfil, tx);
    if (!(await travarTransferenciaRepository(transferenciaId, dados.empresaId, tx))) {
      throw new Error("Registro nao encontrado");
    }
    // Retrato SOB a trava: confirmacao/abertura podem ter mudado o CAIXA da linha entre a leitura
    // e o lock — a revalidacao compara empresa e caixa_id do retrato atual (status nao entra: o
    // PUT sempre aceitou editar transferencia recebida/agendada, e mudar isso e outra decisao).
    const existente = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx, caixa);
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    if (dados.contaOrigemId !== caixa.pdvContaId && dados.contaDestinoId !== caixa.pdvContaId) {
      throw new Error("Transferencia precisa envolver a conta do PDV aberto");
    }
    await atualizarTransferenciaRepository(transferenciaId, resolverObservacaoDoLancamento(dados), computar, tx);
    return { id: transferenciaId, computar };
  });
}

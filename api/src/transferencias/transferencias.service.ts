import { temPermissao, type PerfilUsuario } from "@padaria/shared/autenticacao";
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
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import {
  buscarCaixaPorIdRepository,
  buscarAnexoFechamentoCaixaRepository,
  buscarContaCofreEmpresaRepository,
  criarConferenciaFisicaTransferenciaRepository,
  criarQuebraCaixaRepository,
  listarUsuariosTesourariaRepository,
  listarAnexosFechamentoCaixaRepository,
  travarCaixaCompartilhadoRepository
} from "../caixa/caixa.repository.js";
import { ehMovimentoDoCaixaParaOCofre } from "./entrega-cofre.repository.js";
import { travarCaixaAbertoDaContaPdv, travarCaixaAbertoDoAtor } from "../caixa/caixa.service.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { existeNumeroLacreRepository } from "../lacres/lacres.repository.js";
import { paraCentavos } from "@padaria/shared/dinheiro";
import {
  exigirContaForaDoCaixaFechadoNaCorrida,
  exigirPermissaoLancamento,
  exigirSaldoSuficienteNaConta,
  travarContasDaEdicao,
  saldoJaReservadoNaMesmaConta,
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
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import {
  atualizarTransferenciaRepository,
  buscarContextoConferenciaRepository,
  buscarTransferenciaDetalheRepository,
  travarTransferenciaRepository,
  confirmarTransferenciaRepository,
  encerrarDivergenciaRepository,
  contasPertencemEmpresaRepository,
  criarTransferenciaRepository,
  contaEhPdvDaEmpresaRepository,
  transferenciaTemPlanejamentoRepository,
  transferenciaPossuiRetornosPlanejadosRepository,
  efetivarTransferenciaAgendadaRepository,
  listarAgendadasVencidasRepository,
  ehConfirmadorElegivelRepository,
  liberarTravaTransferenciaRepository,
  listarDestinatariosTransferenciaRepository,
  listarTravamentosTransferenciaDoUsuarioRepository,
  transferenciaAdmitePrazoRepository,
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
  if (dados.contasDestinoIds.length > 0 && new Set([dados.contaDestinoId, ...dados.contasDestinoIds]).size < 2) {
    throw new Error("Multiplo destino exige ao menos duas contas de destino distintas");
  }
  if (dados.agendadaPara && new Date(dados.agendadaPara).getTime() <= Date.now()) {
    throw new Error("Agendamento precisa estar no futuro");
  }
  if (dados.contasDestinoIds.length && dados.tempoConfirmacao) {
    throw new Error("Tempo de confirmacao e valido somente para transferencia direta");
  }
  const informouComposicao = dados.valorEspecieDeclarado !== undefined || dados.valorMoedasDeclarado !== undefined;
  if (informouComposicao) {
    if (dados.valorEspecieDeclarado === undefined || dados.valorMoedasDeclarado === undefined) {
      throw new Error("Informe especie e moedas do malote");
    }
    if (
      paraCentavos(dados.valorEspecieDeclarado) + paraCentavos(dados.valorMoedasDeclarado) !==
      paraCentavos(dados.valorOriginal)
    ) {
      throw new Error("Especie mais moedas deve ser igual ao valor da transferencia");
    }
  }
  const lacresRetorno = dados.lacresRetorno.map((lacre) => lacre.trim());
  if (new Set(lacresRetorno).size !== lacresRetorno.length) {
    throw new Error("Os lacres de retorno / sangria nao podem se repetir");
  }
  if (dados.nLacreDoc?.trim() && lacresRetorno.includes(dados.nLacreDoc.trim())) {
    throw new Error("O lacre do malote nao pode se repetir como lacre de retorno / sangria");
  }
}

function normalizarCargo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

// R-189: Tesouraria pode conferir a transferencia que planejou ou executou, desde que continue
// vinculada a conta de destino e tenha a permissao efetiva. A excecao e deliberadamente por cargo
// (nao por "admin") para nao liberar auto-conferencia para os demais perfis.
function ehTesouraria(perfil: PerfilUsuario): boolean {
  return perfil.cargos.some((cargo) => normalizarCargo(cargo.nome).startsWith("tesouraria"));
}

export async function listarTransferencias(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarTransferenciasRepository(query, empresasPermitidasIds);
}

// P1/#101 · a entrega ao cofre tem UM caminho, e nao e a transferencia comum.
//
// Esta rota nunca escreve `tipo`: a linha nasce `suprimento`. Lancada pelo operador, ela nascia
// `pendente` e vinculada ao caixa dele — logo, contava como saida — mas o predicado da guarda de
// fechamento (R-171) procura `sangria`/`retorno` e nao a via. O dinheiro saia do caixa para o cofre
// e o turno fechava por cima dele: o defeito exato que a Fatia 1 existe para eliminar, entrando por
// outra porta.
//
// Alargar a guarda seria tratar o sintoma. O que estava errado e a porta existir: pela D9/R-179
// quem leva dinheiro do Caixa ao Cofre e o proprio Caixa, por
// `POST /api/caixa/:id/transferencia-cofre` — o unico escritor de `sangria`/`retorno`, que exige
// confirmador elegivel, numera a ordem, controla o lacre e e idempotente. Nada disso existe aqui, e
// malote sem conferencia e a diferenca entre dinheiro rastreado e dinheiro sumido.
//
// A funcao e PURA: quem chama ja resolveu a conta cofre. Assim a criacao paga a consulta so quando
// a origem e a conta do PDV, e a edicao — que precisa da mesma conta para a outra trava — paga uma
// vez so.
//
// A mensagem e uma constante porque os TRES escritores de `conta_destino_id` (criacao, edicao e
// conferencia) recusam pelo mesmo motivo: quem quer levar dinheiro do Caixa ao Cofre usa o Caixa.
// Tres copias divergiriam no primeiro ajuste de texto, e a terceira porta ja provou que escritor
// esquecido e o modo de falha desta area.
const CAMINHO_UNICO_DA_ENTREGA_AO_COFRE =
  "Entrega ao cofre nao sai por transferencia comum: registre a transferencia de retorno no proprio Caixa";

function exigirCaminhoUnicoDaEntregaAoCofre(movimento: {
  contaOrigemId: string;
  contaDestinoId: string;
  pdvContaId: string | null;
  contaCofreId: string | null;
}): void {
  if (!ehMovimentoDoCaixaParaOCofre(movimento)) return;
  throw new Error(CAMINHO_UNICO_DA_ENTREGA_AO_COFRE);
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
      for (const lacre of [dados.nLacreDoc!, ...dados.lacresRetorno]) {
        const lacreExistente = await existeNumeroLacreRepository(dados.empresaId, lacre, tx);
        if (lacreExistente) throw new Error("Lacre ja utilizado em outro movimento");
      }
      const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
      if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
      const contasValidas = await contasPertencemEmpresaRepository(
        [dados.contaOrigemId, dados.contaDestinoId, ...dados.contasDestinoIds],
        dados.empresaId,
        tx
      );
      if (!contasValidas) throw new Error("Conta de origem ou destino nao pertence a empresa informada");

      // Malote Cofre -> PDV so pode nascer com a composicao que o Caixa ira conferir. Aceitar a
      // transferencia sem isso e deixa um pendente impossivel de abrir depois.
      const contaCofreDaEmpresa = await buscarContaCofreEmpresaRepository(dados.empresaId, tx);
      const ehMaloteCofreParaPdv =
        contaCofreDaEmpresa === dados.contaOrigemId &&
        (await contaEhPdvDaEmpresaRepository(dados.empresaId, dados.contaDestinoId, tx));
      if (
        ehMaloteCofreParaPdv &&
        (dados.valorEspecieDeclarado === undefined || dados.valorMoedasDeclarado === undefined)
      ) {
        throw new Error("Informe dinheiro fisico e moedas ao preparar o malote para o Caixa");
      }
      if (!ehMaloteCofreParaPdv && dados.lacresRetorno.length) {
        throw new Error("Lacres de retorno / sangria so podem seguir em um malote do Cofre para o Caixa");
      }

      const transferenciaLivre = podeLancarSemCaixa(perfil);
      // P0: o caixa do ator chega TRAVADO (FOR SHARE) e revalidado — mesma porta unica das saidas.
      const resultadoCaixa = transferenciaLivre
        ? await travarCaixaAbertoDoAtor(dados.empresaId, perfil.usuarioId, tx)
        : { caixa: await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx), caixaFechadoNaCorrida: null };
      let { caixa } = resultadoCaixa;
      const { caixaFechadoNaCorrida } = resultadoCaixa;
      // A Tesouraria registra suprimento para o PDV, mas nao possui o caixa daquele operador. Para
      // uma transferencia direta sem planejamento, a conta de destino identifica o caixa que vai
      // receber o dinheiro. Sem esta busca o movimento nascia com `caixa_id` nulo e desaparecia
      // do resumo do PDV, embora a conferencia tenha sido concluida corretamente.
      if (transferenciaLivre && !caixa && !dados.contasDestinoIds.length) {
        caixa = await travarCaixaAbertoDaContaPdv(dados.empresaId, dados.contaDestinoId, tx);
      }
      // Q2: na transferencia a conta do PDV vale como origem OU destino (dinheiro entra e sai).
      exigirContaForaDoCaixaFechadoNaCorrida(caixaFechadoNaCorrida, dados.contaOrigemId, dados.contaDestinoId);
      const envolveContaPdv =
        caixa && (dados.contaOrigemId === caixa.pdvContaId || dados.contaDestinoId === caixa.pdvContaId);
      if (!transferenciaLivre && !envolveContaPdv) {
        throw new Error("Transferencia do operador Caixa precisa envolver a conta do PDV aberto");
      }
      // A consulta ao cofre so acontece quando a origem E a conta do PDV: transferencia comum e
      // suprimento (cofre -> caixa) nao pagam por esta guarda.
      //
      // TODA conta que pode virar destino entra na verificacao — a ancora E as candidatas de
      // `contasDestinoIds`. A conferencia reescreve `conta_destino_id` com a candidata vencedora,
      // entao olhar so a ancora seria fechar a porta e deixar a janela ao lado aberta: bastava
      // listar o cofre como candidato para montar o mesmo malote em dois tempos.
      if (caixa && dados.contaOrigemId === caixa.pdvContaId) {
        const contaCofreId = await buscarContaCofreEmpresaRepository(dados.empresaId, tx);
        for (const contaDestinoId of [dados.contaDestinoId, ...dados.contasDestinoIds]) {
          exigirCaminhoUnicoDaEntregaAoCofre({
            contaOrigemId: dados.contaOrigemId,
            contaDestinoId,
            pdvContaId: caixa.pdvContaId,
            contaCofreId
          });
        }
      }

      // R-143 literal ("nao existe transferencia sem fundo na conta de origem"), agora com teste.
      // Vale na CRIACAO porque e nela que o dinheiro sai (R-036): pendente ja conta como saida da
      // origem. So a ORIGEM e travada — o destino apenas recebe, e creditar nunca falta dinheiro.
      await exigirSaldoSuficienteNaConta(
        {
          empresaId: dados.empresaId,
          podeVerSaldo: temPermissao(perfil.permissoes, "cadastro_contas_visualizar"),
          contaOrigemId: dados.contaOrigemId,
          valorCentavos: computar ? paraCentavos(dados.valorOriginal) : 0
        },
        tx
      );

      const transferencia = await criarTransferenciaRepository(
        resolverObservacaoDoLancamento(dados),
        computar,
        perfil.usuarioId,
        envolveContaPdv ? caixa!.id : null,
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
    if (await transferenciaPossuiRetornosPlanejadosRepository(transferenciaId, tx)) {
      throw new Error("Transferencia com retorno planejado deve ser recebida pela abertura do Caixa usando o lacre");
    }

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

    // P1/#101 · a conferencia e o TERCEIRO escritor de `conta_destino_id`, e a autoridade final.
    //
    // `confirmarTransferenciaRepository` grava a conta candidata vencedora. Sem esta guarda, uma
    // transferencia comum do caixa — criada com o cofre entre as `contasDestinoIds` — virava
    // malote Caixa -> Cofre no ato da conferencia, depois do fechamento e sem nenhuma das amarras
    // do fluxo canonico: sem confirmador exigido na criacao, sem ordem, sem idempotencia e sem
    // recusa auditavel, porque `tipo` continua `suprimento` e `/recusar-conferencia` responde 404.
    //
    // A criacao ja nao deixa mais essa linha nascer. Esta trava alcanca as que JA existem: sem ela,
    // o legado do banco continuaria com o atalho aberto. `ehCaixaParaCofre` sai de fora porque a
    // entrega canonica confirma exatamente assim — e ela e o caminho que deve funcionar.
    if (contexto && !contexto.ehRetornoDoCaixa && contexto.caixaId && dados.contaDestinoId === contexto.contaCofreId) {
      throw new Error(CAMINHO_UNICO_DA_ENTREGA_AO_COFRE);
    }

    if (contexto?.ehRetornoDoCaixa) {
      if (dados.valorRecebido == null || dados.valorEspecieContado == null || dados.valorMoedasContado == null) {
        throw erroValidacao(
          "Informe valor, especie e moedas para conferir uma entrega do Caixa",
          "VALOR_RECEBIDO_OBRIGATORIO"
        );
      }
      if (
        paraCentavos(dados.valorEspecieContado) + paraCentavos(dados.valorMoedasContado) !==
        paraCentavos(dados.valorRecebido)
      ) {
        throw erroValidacao("Especie mais moedas deve ser igual ao valor recebido", "COMPOSICAO_INVALIDA");
      }
      const divergeValor = paraCentavos(dados.valorRecebido) !== contexto.valorCentavos;
      const divergeLacre = (contexto.lacre ?? null) !== (dados.nLacreDoc?.trim() || null);
      const divergeEspecie =
        contexto.valorEspecieDeclaradoCentavos !== null &&
        paraCentavos(dados.valorEspecieContado) !== contexto.valorEspecieDeclaradoCentavos;
      const divergeMoedas =
        contexto.valorMoedasDeclaradoCentavos !== null &&
        paraCentavos(dados.valorMoedasContado) !== contexto.valorMoedasDeclaradoCentavos;
      if (divergeValor || divergeLacre || divergeEspecie || divergeMoedas) {
        throw new ErroDominio(
          "Conferencia divergente: registre a recusa com o motivo em /recusar-conferencia",
          409,
          "CONFERENCIA_DIVERGENTE"
        );
      }
    }

    const confirmada = await confirmarTransferenciaRepository(
      transferenciaId,
      dados,
      perfil.usuarioId,
      ehTesouraria(perfil),
      tx
    );
    if (!confirmada) throw new Error("Somente operador de uma conta destino pode confirmar uma unica vez");
    if (
      contexto?.ehRetornoDoCaixa &&
      contexto.caixaId &&
      contexto.valorEspecieDeclaradoCentavos !== null &&
      contexto.valorMoedasDeclaradoCentavos !== null
    ) {
      await criarConferenciaFisicaTransferenciaRepository(
        {
          empresaId: contexto.empresaId,
          transferenciaId,
          fechamentoCaixaId: contexto.caixaId,
          etapa: "retorno_sangria",
          resultado: "convergente",
          encerraConferencia: true,
          valorEspecieDeclaradoCentavos: contexto.valorEspecieDeclaradoCentavos,
          valorMoedasDeclaradoCentavos: contexto.valorMoedasDeclaradoCentavos,
          valorEspecieContadoCentavos: paraCentavos(dados.valorEspecieContado),
          valorMoedasContadoCentavos: paraCentavos(dados.valorMoedasContado),
          observacao: null,
          conferidoPor: perfil.usuarioId,
          conferidoEm: new Date()
        },
        tx
      );
    }

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
): Promise<{ registrada: true; transferenciaId: string; tentativas: number; encerrada: boolean }> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_conferir");
  return executarEmTransacao(async (tx) => {
    const contexto = await buscarContextoConferenciaRepository(transferenciaId, tx);
    if (!contexto || !podeAcessarEmpresa(perfil, contexto.empresaId)) throw new Error("Registro nao encontrado");
    // Generica nao tem recusa auditavel: para ela isto e 404, e nao "nao pode" — o caminho dela
    // continua sendo o `/confirmar` com a regra vigente.
    if (!contexto.ehRetornoDoCaixa) throw new Error("Registro nao encontrado");

    // R-183 · a linha do caixa vem TRAVADA (FOR SHARE) antes de qualquer decisao, exatamente como no
    // `/confirmar`. Ate aqui a recusa nao travava nada porque nao movia dinheiro; agora ela pode
    // encerrar a entrega e gravar quebra, entao precisa serializar com o fechamento em voo — senao
    // duas verdades sobre o mesmo turno commitam em paralelo.
    if (contexto.caixaId) await travarCaixaCompartilhadoRepository(contexto.caixaId, tx);

    // Releitura SOB a trava: entre a leitura acima e o lock, um `/confirmar` ou outro encerramento
    // pode ter mudado o desfecho. Sem isto a decisao sairia de um retrato velho.
    const atual = await buscarContextoConferenciaRepository(transferenciaId, tx);
    if (!atual || atual.status !== "pendente") throw new Error("Transferencia nao esta pendente de confirmacao");

    // Mesma elegibilidade da confirmacao: vinculado a conta destino e, exceto Tesouraria (R-189),
    // diferente de quem criou/executou. Sem isso, um operador comum poderia recusar a propria entrega.
    const elegivel = await ehConfirmadorElegivelRepository(
      {
        transferenciaId,
        contaId: dados.contaDestinoId,
        usuarioId: perfil.usuarioId,
        permitirAutoconferenciaTesouraria: ehTesouraria(perfil)
      },
      tx
    );
    if (!elegivel) throw new Error("Somente operador de uma conta destino pode conferir esta transferencia");

    // R-183 · o que o cofre CONTOU. Quando a recusa vai encerrar, o numero e obrigatorio e pode ser
    // ZERO — "lacre violado, nao abro e nao conto" e uma contagem valida de R$ 0,00, e e ela que faz
    // o declarado inteiro virar quebra. Por isso `null` (nao informado) e recusado no encerramento:
    // sem numero nao ha o que creditar nem o que quebrar.
    const contadoCentavos = dados.valorRecebido == null ? null : paraCentavos(dados.valorRecebido);
    const especieContadaCentavos = dados.valorEspecieContado == null ? null : paraCentavos(dados.valorEspecieContado);
    const moedasContadasCentavos = dados.valorMoedasContado == null ? null : paraCentavos(dados.valorMoedasContado);
    if (contadoCentavos !== null || especieContadaCentavos !== null || moedasContadasCentavos !== null) {
      if (contadoCentavos === null || especieContadaCentavos === null || moedasContadasCentavos === null) {
        throw erroValidacao("Informe valor, especie e moedas da contagem", "COMPOSICAO_OBRIGATORIA");
      }
      if (especieContadaCentavos + moedasContadasCentavos !== contadoCentavos) {
        throw erroValidacao("Especie mais moedas deve ser igual ao valor contado", "COMPOSICAO_INVALIDA");
      }
    }
    if (dados.encerrar) {
      if (contadoCentavos === null) {
        throw erroValidacao(
          "Informe o valor contado para encerrar a divergencia — use 0 quando o malote nao foi aberto",
          "VALOR_CONTADO_OBRIGATORIO"
        );
      }
      // C > D: a D7 proibe transformar sobra em quebra positiva, entao o unico contrapeso possivel e
      // alguem assumir por escrito que contou MAIS do que foi declarado. Sem isso o cofre seria
      // creditado a mais sem dono.
      if (contadoCentavos > atual.valorCentavos && !dados.sobraConfirmada) {
        throw new ErroDominio(
          "Contagem acima do declarado: confirme a sobra para encerrar a divergencia",
          409,
          "SOBRA_NAO_CONFIRMADA"
        );
      }
    }

    const registro = await registrarRecusaConferenciaRepository(
      {
        transferenciaId,
        recusadoPor: perfil.usuarioId,
        motivo: dados.motivo.trim(),
        lacreInformado: dados.nLacreDoc?.trim() || null,
        valorInformadoCentavos: contadoCentavos
      },
      tx
    );
    if (
      atual.caixaId &&
      atual.valorEspecieDeclaradoCentavos !== null &&
      atual.valorMoedasDeclaradoCentavos !== null &&
      especieContadaCentavos !== null &&
      moedasContadasCentavos !== null
    ) {
      await criarConferenciaFisicaTransferenciaRepository(
        {
          empresaId: atual.empresaId,
          transferenciaId,
          fechamentoCaixaId: atual.caixaId,
          etapa: "retorno_sangria",
          resultado: "divergente",
          encerraConferencia: dados.encerrar,
          valorEspecieDeclaradoCentavos: atual.valorEspecieDeclaradoCentavos,
          valorMoedasDeclaradoCentavos: atual.valorMoedasDeclaradoCentavos,
          valorEspecieContadoCentavos: especieContadaCentavos,
          valorMoedasContadoCentavos: moedasContadasCentavos,
          observacao: dados.motivo.trim(),
          conferidoPor: perfil.usuarioId,
          conferidoEm: new Date()
        },
        tx
      );
    }

    // R-183 · o DESFECHO. Sem `encerrar`, nada muda: a entrega continua `pendente`, o fechamento
    // continua travado e o cofre pode reconferir — que e o comportamento de sempre.
    if (dados.encerrar && contadoCentavos !== null) {
      if (!atual.caixaId) throw new Error("Entrega ao cofre sem caixa vinculado");
      const encerrada = await encerrarDivergenciaRepository(
        {
          transferenciaId,
          caixaId: atual.caixaId,
          valorRecebidoCentavos: contadoCentavos,
          lacreDoMovimento: atual.lacre
        },
        tx
      );
      // Zero linhas = a entrega deixou de ser `pendente` entre a trava e o UPDATE, ou nao e deste
      // caixa. Erro de dominio, nunca um segundo encerramento silencioso.
      if (!encerrada) throw new Error("Transferencia nao esta pendente de confirmacao");

      // A falta vira quebra; a sobra nao (D7). A quebra nasce contra o fechamento a que a ENTREGA
      // pertence — aberto ou fechado —, e e isso que faz o retorno final do fechamento ter desfecho.
      const faltaCentavos = atual.valorCentavos - contadoCentavos;
      if (faltaCentavos > 0) {
        const dono = atual.executadoPor ?? atual.criadoPor;
        if (!dono) throw new Error("Entrega sem responsavel para responder pela quebra");
        const quebra = await criarQuebraCaixaRepository(
          {
            empresaId: atual.empresaId,
            fechamentoCaixaId: atual.caixaId,
            usuarioId: dono,
            // Negativo, na mesma convencao do escritor que ja existia: negativo = faltou.
            valorCentavos: -faltaCentavos,
            observacao: dados.motivo.trim(),
            transferenciaId
          },
          tx
        );

        // A quebra emite o MESMO sinal que a quebra de contagem ja emitia (`caixa.service`, no
        // fechamento): tipo `quebra_caixa` e `referenciaId` da propria quebra. Sem isto a maior
        // consequencia financeira do ato chegaria ao dono como "conferencia recusada", indistinguivel
        // de uma recusa que ele ainda pode resolver — e `quebras_caixa` nao tem leitor nenhum no
        // sistema, entao esta notificacao e a unica superficie que existe.
        const tesourariaDaQuebra = await listarUsuariosTesourariaRepository(atual.empresaId, tx);
        await criarNotificacoesRepository(
          {
            empresaId: atual.empresaId,
            tipo: "quebra_caixa",
            destinatariosUsuarioIds: [
              ...new Set(
                [dono, ...tesourariaDaQuebra.map((item) => item.usuarioId)].filter((id): id is string => Boolean(id))
              )
            ],
            referenciaId: quebra.id,
            titulo: `Quebra por divergencia no cofre - ${atual.lacre ?? transferenciaId}`,
            valorCentavos: -faltaCentavos
          },
          tx
        );
      }
    }

    // Quem precisa saber: quem ENTREGOU (o executor real da solicitacao D4, ou o criador quando a
    // entrega foi avulsa/retorno final) mais a Tesouraria/Gestao. Usar so `criado_por` numa
    // solicitacao programada avisaria quem programou e deixaria o operador no escuro.
    const operador = atual.executadoPor ?? atual.criadoPor;
    const tesouraria = await listarUsuariosTesourariaRepository(atual.empresaId, tx);
    const destinatarios = [
      ...new Set([operador, ...tesouraria.map((item) => item.usuarioId)].filter((id): id is string => Boolean(id)))
    ];
    await criarNotificacoesRepository(
      {
        empresaId: atual.empresaId,
        tipo: "transferencia_divergencia",
        destinatariosUsuarioIds: destinatarios,
        referenciaId: transferenciaId,
        titulo: `Conferencia recusada (${registro.tentativas}a tentativa) - ${atual.lacre ?? transferenciaId}`,
        valorCentavos: dados.valorRecebido == null ? null : paraCentavos(dados.valorRecebido) - atual.valorCentavos,
        // Cada nova tentativa reabre a pendencia: sem isto, quem ja tinha marcado a primeira
        // recusa como vista nunca seria avisado da segunda.
        reabrir: true
      },
      tx
    );

    return { registrada: true, transferenciaId, tentativas: registro.tentativas, encerrada: Boolean(dados.encerrar) };
  });
}

// Variante NAO-LANCADORA da porta de saldo, so para o cron: aqui "sem fundo" nao e erro do usuario,
// e motivo para adiar. Reusa a MESMA porta (nada de segunda formula) e traduz o 409 em boolean.
async function contaTemSaldoParaAgendada(
  agendada: { empresaId: string; contaOrigemId: string; valorOriginal: string | number },
  tx: TransacaoBanco
): Promise<boolean> {
  try {
    await exigirSaldoSuficienteNaConta(
      {
        empresaId: agendada.empresaId,
        contaOrigemId: agendada.contaOrigemId,
        valorCentavos: paraCentavos(agendada.valorOriginal)
      },
      tx
    );
    return true;
  } catch (erro) {
    // SO a falta de saldo adia. Timeout de lock (55P03), deadlock e qualquer outro erro sobem —
    // engolir tudo aqui transformaria uma falha de infraestrutura em "adiado" silencioso.
    if (erro instanceof ErroDominio && erro.code === "SALDO_INSUFICIENTE") return false;
    throw erro;
  }
}

export async function processarTransferenciasTemporais(agora = new Date()) {
  // S1 (R-164, Jose 11/08): efetivar `agendada -> pendente` altera a SAIDA do caixa da linha,
  // entao cada agendada com caixa entra na porta — FOR SHARE + revalidacao. Caixa aberto: efetiva;
  // caixa FECHADO: nao altera status nem totais (a linha permanece agendada e sera reavaliada nos
  // proximos ciclos).
  //
  // UMA TRANSACAO POR LINHA, e nao uma para o lote inteiro. Tres motivos, todos medidos:
  //  1. o lote inteiro numa transacao acumulava `FOR NO KEY UPDATE` de TODAS as contas do lote ate
  //     o commit — enquanto ele rodava, qualquer escrita do operador nessas contas ficava na fila e
  //     estourava o `lock_timeout` de 10s (55P03 -> 503);
  //  2. uma falha no fim desfazia as agendadas ja efetivadas no comeco, o que anula o proprio
  //     `continue` que existe para nao derrubar as outras do lote;
  //  3. o ABBA com o PUT: o cron segurava conta + linha por todo o lote, aumentando a janela.
  //
  // A leitura da lista fica FORA de transacao de escrita: ela e so o roteiro. Cada linha revalida
  // tudo sob os proprios locks, entao uma agendada que mudou de estado no meio do caminho e
  // simplesmente descartada pelo predicado atomico do UPDATE.
  const agendadasVencidas = await listarAgendadasVencidasRepository(agora);
  for (const agendada of agendadasVencidas) {
    await executarEmTransacao(async (tx) => {
      if (agendada.caixaId) {
        const trava = await travarCaixaCompartilhadoRepository(agendada.caixaId, tx);
        if (trava?.status !== "aberto") return;
      }
      // R-165: `agendada` NAO conta como saida; `pendente` conta. Logo esta efetivacao E o debito,
      // e o saldo pode ter mudado entre o agendamento e hoje. Sem fundo, a linha permanece
      // `agendada` e volta a ser avaliada no proximo ciclo — espelho exato do que a S1 ja faz com
      // caixa fechado.
      if (agendada.computar) {
        const cabe = await contaTemSaldoParaAgendada(agendada, tx);
        if (!cabe) return;
      }
      await efetivarTransferenciaAgendadaRepository(
        agendada.id,
        agendada.tempoConfirmacao as TempoConfirmacao | null,
        agora,
        tx
      );
    });
  }

  await executarEmTransacao(async (tx) => {
    const vencidas = await listarTransferenciasVencidasRepository(agora, tx);
    for (const transferencia of vencidas) {
      if (!(await transferenciaAdmitePrazoRepository(transferencia.id, tx))) continue;
      const candidatos = await listarDestinatariosTransferenciaRepository(transferencia.id, tx);
      const destinatarios = (
        await Promise.all(
          candidatos.map(async (candidato) => {
            const perfil = await buscarPerfilUsuario(candidato.usuarioId);
            if (
              !perfil ||
              !podeAcessarEmpresa(perfil, transferencia.empresaId) ||
              !temPermissao(perfil.permissoes, "transferencias_conferir")
            ) {
              return null;
            }
            const elegivel = await ehConfirmadorElegivelRepository(
              {
                transferenciaId: transferencia.id,
                contaId: candidato.contaId,
                usuarioId: candidato.usuarioId,
                permitirAutoconferenciaTesouraria: ehTesouraria(perfil)
              },
              tx
            );
            return elegivel ? candidato.usuarioId : null;
          })
        )
      ).filter((usuarioId): usuarioId is string => Boolean(usuarioId));
      await criarNotificacoesRepository(
        {
          empresaId: transferencia.empresaId,
          tipo: "transferencia_prazo_confirmacao",
          destinatariosUsuarioIds: [
            ...new Set([transferencia.criadoPor, ...destinatarios].filter((id): id is string => Boolean(id)))
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

export async function usuarioEstaTravado(perfil: PerfilUsuario): Promise<boolean> {
  const travamentos = await listarTravamentosTransferenciaDoUsuarioRepository({
    usuarioId: perfil.usuarioId,
    podeConferir: temPermissao(perfil.permissoes, "transferencias_conferir")
  });
  for (const transferencia of travamentos) {
    if (
      podeAcessarEmpresa(perfil, transferencia.empresaId) &&
      (await transferenciaAdmitePrazoRepository(transferencia.id))
    ) {
      return true;
    }
  }
  return false;
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

// As provas pertencem ao fechamento do Caixa, nao a transferencia. A consulta por transferencia
// impede que um conferente acesse anexos de outro caixa apenas conhecendo seu UUID.
async function caixaDaConferencia(transferenciaId: string, perfil: PerfilUsuario) {
  const contexto = await buscarContextoConferenciaRepository(transferenciaId);
  if (!contexto?.ehRetornoDoCaixa || !contexto.caixaId || !podeAcessarEmpresa(perfil, contexto.empresaId)) {
    throw new Error("Registro nao encontrado");
  }
  return { caixaId: contexto.caixaId, empresaId: contexto.empresaId };
}

export async function listarAnexosDaConferencia(transferenciaId: string, perfil: PerfilUsuario) {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_conferir");
  const { caixaId, empresaId } = await caixaDaConferencia(transferenciaId, perfil);
  return listarAnexosFechamentoCaixaRepository(caixaId, empresaId);
}

export async function obterAnexoDaConferencia(transferenciaId: string, anexoId: string, perfil: PerfilUsuario) {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_conferir");
  const { caixaId, empresaId } = await caixaDaConferencia(transferenciaId, perfil);
  const anexo = await buscarAnexoFechamentoCaixaRepository(caixaId, anexoId, empresaId);
  if (!anexo) throw new Error("Registro nao encontrado");
  return { ...anexo, caminhoAbsoluto: caminhoAbsolutoDocumento(anexo.caminho) };
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
    if (await transferenciaTemPlanejamentoRepository(transferenciaId, tx)) {
      throw new Error("Transferencia com retorno planejado nao pode ser editada");
    }
    // Leitura sem lock so para o 404/empresa vir antes dos erros de caixa, como sempre foi.
    const previa = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    // P0 — ordem unica: caixa (FOR SHARE, dentro da validacao) ANTES da linha da transferencia.
    const caixa = await validarEdicaoNoCaixaAberto(previa, dados, perfil, tx);
    // R-165 · ORDEM GLOBAL: `contas` antes da linha. Aqui entram as QUATRO pontas possiveis —
    // origem/destino gravados e origem/destino do payload — porque o PUT reescreve as duas
    // (`atualizarTransferenciaRepository`), e trocar o destino tambem move dinheiro de conta.
    // `travarContasRepository` ordena por id, entao dois PUTs sobre o mesmo par pegam as linhas na
    // mesma sequencia. A pre-leitura (`previa`) so escolhe o que travar; nao autoriza.
    await travarContasDaEdicao(
      dados.empresaId,
      [previa?.contaOrigemId, previa?.contaDestinoId, dados.contaOrigemId, dados.contaDestinoId],
      tx
    );
    if (!(await travarTransferenciaRepository(transferenciaId, dados.empresaId, tx))) {
      throw new Error("Registro nao encontrado");
    }
    // Retrato SOB a trava: confirmacao/abertura podem ter mudado o CAIXA da linha entre a leitura
    // e o lock — a revalidacao compara empresa e caixa_id do retrato atual (status nao entra: o
    // PUT sempre aceitou editar transferencia recebida/agendada, e mudar isso e outra decisao).
    const existente = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx, caixa);
    if (existente) {
      if (existente.tempoConfirmacao !== dados.tempoConfirmacao) {
        throw new Error("Tempo de confirmacao nao pode ser alterado depois da criacao");
      }
      const agendamentoExistente = existente.agendadaPara ? new Date(existente.agendadaPara).getTime() : null;
      const agendamentoNovo = dados.agendadaPara ? new Date(dados.agendadaPara).getTime() : null;
      if (agendamentoExistente !== agendamentoNovo) {
        throw new Error("Agendamento nao pode ser alterado depois da criacao");
      }
    }
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    if (dados.contaOrigemId !== caixa.pdvContaId && dados.contaDestinoId !== caixa.pdvContaId) {
      throw new Error("Transferencia precisa envolver a conta do PDV aberto");
    }

    // P1/#101 · o PUT nao desmancha o que o fluxo do Caixa montou.
    //
    // Duas travas, e as duas guardam a MESMA guarda de fechamento (R-171), que reconhece a entrega
    // pelo destino ser a conta cofre:
    //
    //  1. a entrega ao cofre ja gravada e IMUTAVEL (D5/D9). Sem isto, apontar o destino dela para
    //     outra conta fazia o predicado parar de casar: o fechamento liberava e o malote continuava
    //     na rua, sem turno aberto onde a divergencia do cofre pudesse cair;
    //  2. o payload nao pode TRANSFORMAR uma transferencia comum do caixa em Caixa -> Cofre —
    //     a mesma porta que a criacao ja fechou, alcancada por edicao.
    //
    // Lido do retrato SOB a trava (`existente`), nunca da pre-leitura: entre uma e outra a linha
    // pode ter mudado de caixa.
    //
    // O que NAO entra aqui, de proposito: proibir toda troca de destino em linha com `caixa_id`.
    // Corrigir a conta de destino de uma transferencia comum e edicao legitima e ja tem invariante
    // provada em `caixa-portas-s3-s8` (S6). As duas travas acima fecham os dois bypasses sem
    // alcancar esse caso. `status` tambem nao entra: `valoresBaseEdicao` nao o escreve — o PUT
    // nunca pode mudar status, e uma trava para isso seria codigo morto fingindo protecao.
    if (existente) {
      const contaCofreId = await buscarContaCofreEmpresaRepository(dados.empresaId, tx);
      const pdvContaId = caixa.pdvContaId;
      if (
        ehMovimentoDoCaixaParaOCofre({
          contaOrigemId: existente.contaOrigemId,
          contaDestinoId: existente.contaDestinoId,
          pdvContaId,
          contaCofreId
        })
      ) {
        throw new Error("Entrega ao cofre e movimento imutavel: confira ou recuse a conferencia no cofre");
      }
      exigirCaminhoUnicoDaEntregaAoCofre({
        contaOrigemId: dados.contaOrigemId,
        contaDestinoId: dados.contaDestinoId,
        pdvContaId,
        contaCofreId
      });
    }

    // R-165 na EDICAO: delta real sobre a conta de ORIGEM. `jaReservado` so devolve o valor gravado
    // quando a origem NAO muda — senao o reenvio identico cobraria o valor duas vezes.
    await exigirSaldoSuficienteNaConta(
      {
        empresaId: dados.empresaId,
        podeVerSaldo: temPermissao(perfil.permissoes, "cadastro_contas_visualizar"),
        contaOrigemId: dados.contaOrigemId,
        valorCentavos: computar ? paraCentavos(dados.valorOriginal) : 0,
        jaReservadoCentavos: saldoJaReservadoNaMesmaConta(existente, dados.contaOrigemId)
      },
      tx
    );
    await atualizarTransferenciaRepository(transferenciaId, resolverObservacaoDoLancamento(dados), computar, tx);
    return { id: transferenciaId, computar };
  });
}

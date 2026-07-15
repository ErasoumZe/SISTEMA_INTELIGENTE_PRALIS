import { randomBytes } from "node:crypto";
import type {
  AbrirCaixaPayload,
  AcertarSaldoCaixaPayload,
  AlterarHorarioCaixaPayload,
  AlterarHorarioCaixaResponse,
  CaixaOperacional,
  CaixaStatus,
  EditarAberturaCaixaPayload,
  FecharCaixaPayload,
  ResumoCaixa,
  TotaisCaixaCentavos
} from "@padaria/shared/caixa";
import { montarResumoCaixa, saldoCaixaCentavos } from "@padaria/shared/caixa";
import { temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared/autenticacao";
import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { ErroDominio, erroValidacao, naoEncontrado } from "../erros.js";
import { hashTokenAutorizacao } from "./autorizacoes.service.js";
import {
  atualizarStatusAutorizacaoRepository,
  buscarAutorizacaoPorTokenRepository
} from "./autorizacoes.repository.js";
import {
  atualizarAberturaCaixaRepository,
  atualizarFechamentoCaixaRepository,
  atualizarHorarioCaixaRepository,
  buscarCaixaAbertoUsuarioRepository,
  buscarCaixaPorIdRepository,
  buscarColaboradorPorUsuarioRepository,
  buscarGrupoQuebraCaixa,
  buscarPdvEmpresaRepository,
  buscarPerfilUsuarioCaixaRepository,
  caixaTemLancamentosRepository,
  calcularTotaisCaixaOperacionalRepository,
  criarAcertoSaldoCaixaRepository,
  criarCaixaRepository,
  existeCaixaAbertoPdvRepository,
  existePeriodoCaixaRepository,
  listarHistoricoCaixaRepository,
  registrarEdicaoCaixaRepository,
  revincularVendasAoCaixaRepository
} from "./caixa.repository.js";

const erroPeriodo = "A data e hora de abertura ja pertence a outro caixa aberto/fechado";
const indiceCaixaAbertoUnico = "fechamentos_caixa_pdv_aberto_unico_idx";

type CaixaLinha = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

// Duas aberturas simultaneas do mesmo PDV podem passar pelos pre-checks; o indice unico
// parcial do banco decide o vencedor e o perdedor recebe o mesmo erro do caminho sequencial.
function ehViolacaoCaixaAbertoUnico(error: Error): boolean {
  const candidatos = [error, error.cause instanceof Error ? error.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    return detalhes.code === "23505" && detalhes.constraint === indiceCaixaAbertoUnico;
  });
}

function traduzirErroAberturaCaixa(error: Error): Error {
  return ehViolacaoCaixaAbertoUnico(error) ? new Error(erroPeriodo) : error;
}

function gerarTokenEdicao() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function dataObrigatoria(valor: string, campo: string) {
  const valorNormalizado = valor.trim();
  const temFusoExplicito = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(valorNormalizado);
  const data = new Date(temFusoExplicito ? valorNormalizado : `${valorNormalizado}Z`);
  if (Number.isNaN(data.getTime())) throw new Error(`${campo} invalida`);
  return data;
}

function numero(valor: string | number | null | undefined) {
  return deCentavos(paraCentavos(valor));
}

function serializarData(data: Date | string | null) {
  return data ? new Date(data).toISOString() : null;
}

function serializarCaixa(caixa: CaixaLinha): CaixaOperacional {
  if (!caixa.pdvId || !caixa.usuarioId || !caixa.usuarioCaixaId || !caixa.dataHoraAbertura || !caixa.abertoEm) {
    throw new Error("Caixa operacional invalido");
  }
  return {
    id: caixa.id,
    empresaId: caixa.empresaId,
    pdvId: caixa.pdvId,
    pdvNome: caixa.pdvNome,
    usuarioId: caixa.usuarioId,
    usuarioCaixaId: caixa.usuarioCaixaId,
    usuarioCaixaNome: caixa.usuarioCaixaNome ?? "Usuario",
    colaboradorId: caixa.colaboradorId,
    dataHoraAbertura: serializarData(caixa.dataHoraAbertura) ?? "",
    abertoEm: serializarData(caixa.abertoEm) ?? "",
    dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
    fechadoEm: serializarData(caixa.fechadoEm),
    tokenEdicao: caixa.tokenEdicao,
    turnoId: caixa.turnoId ?? null,
    observacao: caixa.observacao,
    status: caixa.status
  };
}

function podeOperarCaixa(perfil: PerfilUsuario, caixa: CaixaLinha) {
  return (
    temPermissao(perfil.permissoes, "caixas_gerenciar") ||
    caixa.usuarioId === perfil.usuarioId ||
    caixa.usuarioCaixaId === perfil.usuarioId
  );
}

async function calcularTotaisCaixaCentavos(caixa: CaixaLinha, db?: ExecutorBanco): Promise<TotaisCaixaCentavos> {
  if (!caixa.pdvContaId) throw new Error("PDV sem conta vinculada");
  return calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId, db);
}

// Revincula as vendas integradas ORFAS ao caixa apos qualquer mudanca de horario (ou na abertura
// retroativa). Nunca move venda de outro caixa nem venda manual — ver revincularVendasAoCaixaRepository.
export async function revincularVendasAoCaixa(
  caixa: CaixaLinha,
  db: ExecutorBanco
): Promise<{ anexadas: number; desanexadas: number }> {
  if (!caixa.pdvId || !caixa.dataHoraAbertura) return { anexadas: 0, desanexadas: 0 };
  const abertura = new Date(caixa.dataHoraAbertura);
  const limiteSuperior = caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : new Date();
  return revincularVendasAoCaixaRepository(
    { caixaId: caixa.id, empresaId: caixa.empresaId, pdvId: caixa.pdvId, abertura, limiteSuperior },
    db
  );
}

export async function calcularResumoCaixaOperacional(caixa: CaixaLinha, db?: ExecutorBanco): Promise<ResumoCaixa> {
  return montarResumoCaixa(await calcularTotaisCaixaCentavos(caixa, db));
}

export async function obterStatusCaixa(empresaId: string, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa) return { caixaAberto: null, resumo: null };
  return {
    caixaAberto: serializarCaixa(caixa),
    resumo: await calcularResumoCaixaOperacional(caixa)
  };
}

export interface EscopoListagemCaixa {
  bloquear: boolean;
  caixaId: string | undefined;
}

/**
 * Impoe, no servidor, o escopo "somente caixa aberto" das telas de movimentacao.
 * Se o perfil tem `menu_<tela>_somente_caixa_aberto`, a listagem fica presa ao caixa
 * aberto do usuario (ignorando qualquer caixaId pedido pelo cliente); sem caixa aberto,
 * nao retorna nada. Sem a flag, mantem o comportamento livre (filtro opcional por caixaId).
 */
export async function resolverEscopoListagemPorCaixa(
  perfil: PerfilUsuario | undefined,
  telaId: string,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const flag = `menu_${telaId}_somente_caixa_aberto` as Permissao;
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, flag);
  if (!exigeCaixaAberto) return { bloquear: false, caixaId: caixaIdSolicitado };
  if (!perfil || !empresaId) return { bloquear: true, caixaId: undefined };
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa) return { bloquear: true, caixaId: undefined };
  return { bloquear: false, caixaId: caixa.id };
}

export async function abrirCaixa(dados: AbrirCaixaPayload, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, dados.empresaId)) throw new Error("Empresa nao permitida");
  const dataHoraAbertura = dataObrigatoria(dados.dataHoraAbertura, "Data de abertura");

  try {
    return await abrirCaixaEmTransacao(dados, perfil, dataHoraAbertura);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

async function abrirCaixaEmTransacao(
  dados: AbrirCaixaPayload,
  perfil: PerfilUsuario,
  dataHoraAbertura: Date
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    const pdv = await buscarPdvEmpresaRepository(dados.pdvId, dados.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    if (!pdv.contaId) throw new Error("PDV sem conta vinculada");
    const usuarioCaixa = await buscarPerfilUsuarioCaixaRepository(dados.usuarioCaixaId, tx);
    if (!usuarioCaixa) throw new Error("Usuario do caixa nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, dados.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, undefined, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, undefined, tx)) throw new Error(erroPeriodo);

    const caixa = await criarCaixaRepository(
      {
        empresaId: dados.empresaId,
        pdvId: dados.pdvId,
        usuarioId: perfil.usuarioId,
        usuarioCaixaId: dados.usuarioCaixaId,
        colaboradorId: colaborador.id,
        dataHoraAbertura,
        tokenEdicao: gerarTokenEdicao(),
        // Turno da abertura: informado no ato ou, na ausencia, o turno padrao do colaborador.
        turnoId: dados.turnoId ?? colaborador.turnoPadraoId ?? null,
        observacao: dados.observacao?.trim() || null
      },
      tx
    );
    const aberto = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!aberto) throw new Error("Caixa nao encontrado apos abertura");
    // Abertura retroativa (ex.: abriu 12:53 informando 08:00): puxa as vendas orfas do periodo.
    await revincularVendasAoCaixa(aberto, tx);
    return { caixaAberto: serializarCaixa(aberto), resumo: await calcularResumoCaixaOperacional(aberto, tx) };
  });
}

export async function editarAberturaCaixa(
  caixaId: string,
  dados: EditarAberturaCaixaPayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  try {
    return await editarAberturaCaixaEmTransacao(caixaId, dados, perfil);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

async function editarAberturaCaixaEmTransacao(
  caixaId: string,
  dados: EditarAberturaCaixaPayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (caixa.tokenEdicao !== dados.tokenEdicao) throw new Error("Token de edicao invalido");

    const dataHoraAbertura = dataObrigatoria(dados.dataHoraAbertura, "Data de abertura");
    const pdv = await buscarPdvEmpresaRepository(dados.pdvId, caixa.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, caixa.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    if (caixa.pdvId !== dados.pdvId && (await caixaTemLancamentosRepository(caixa.id, tx))) {
      throw new Error("Nao e possivel trocar PDV de caixa com lancamentos");
    }
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, caixa.id, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, caixa.id, tx)) throw new Error(erroPeriodo);

    const novoToken = gerarTokenEdicao();
    const valoresAntigos = {
      pdvId: caixa.pdvId,
      usuarioCaixaId: caixa.usuarioCaixaId,
      dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
      observacao: caixa.observacao
    };
    const valoresNovos = {
      pdvId: dados.pdvId,
      usuarioCaixaId: dados.usuarioCaixaId,
      dataHoraAbertura: dataHoraAbertura.toISOString(),
      observacao: dados.observacao?.trim() || null
    };

    await registrarEdicaoCaixaRepository(
      { caixaId: caixa.id, tokenUsado: dados.tokenEdicao, editadoPor: perfil.usuarioId, valoresAntigos, valoresNovos },
      tx
    );
    await atualizarAberturaCaixaRepository(
      {
        caixaId: caixa.id,
        pdvId: dados.pdvId,
        usuarioCaixaId: dados.usuarioCaixaId,
        colaboradorId: colaborador.id,
        dataHoraAbertura,
        observacao: dados.observacao?.trim() || null,
        tokenEdicao: novoToken
      },
      tx
    );

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado apos edicao");
    // Qualquer edicao de horario dispara a revinculacao retroativa das vendas integradas.
    await revincularVendasAoCaixa(atualizado, tx);
    return { caixaAberto: serializarCaixa(atualizado), resumo: await calcularResumoCaixaOperacional(atualizado, tx) };
  });
}

// Valida e CONSOME (uso unico) o token de autorizacao do proprio solicitante para este caixa.
// Invalido -> 400; ja usado / indisponivel / expirado -> 410 (nunca 200). Compara so o hash.
async function consumirTokenAutorizacao(
  caixaId: string,
  solicitanteId: string,
  token: string | undefined,
  tx: ExecutorBanco
): Promise<string> {
  const tokenLimpo = token?.trim();
  if (!tokenLimpo) throw erroValidacao("Token obrigatorio", "TOKEN_OBRIGATORIO");
  const autorizacao = await buscarAutorizacaoPorTokenRepository(
    { caixaId, solicitanteId, tokenHash: hashTokenAutorizacao(tokenLimpo) },
    tx
  );
  if (!autorizacao) throw erroValidacao("Token invalido", "TOKEN_INVALIDO");
  if (autorizacao.status === "usada") throw new ErroDominio("Token ja utilizado", 410, "TOKEN_JA_UTILIZADO");
  if (autorizacao.status !== "pendente") throw new ErroDominio("Token indisponivel", 410, "TOKEN_INDISPONIVEL");
  if (!autorizacao.expiraEm || new Date(autorizacao.expiraEm) <= new Date()) {
    throw new ErroDominio("Token expirado", 410, "TOKEN_EXPIRADO");
  }
  await atualizarStatusAutorizacaoRepository({ id: autorizacao.id, status: "usada" }, tx);
  return autorizacao.autorizadorId;
}

// Altera o horario de ABERTURA do caixa: gerente/admin (caixa_alterar_horario) direto; operador via
// token de autorizacao. Observacao SEMPRE obrigatoria. Ao final, revincula as vendas integradas
// (anexa/desanexa) e audita em edicoes_caixa com o autorizador, a observacao e as contagens.
export async function alterarHorarioCaixa(
  caixaId: string,
  payload: AlterarHorarioCaixaPayload,
  perfil: PerfilUsuario
): Promise<AlterarHorarioCaixaResponse> {
  const observacao = payload.observacao.trim();
  if (!observacao) throw erroValidacao("Observacao obrigatoria", "OBSERVACAO_OBRIGATORIA");
  const novaAbertura = payload.dataHoraAbertura
    ? dataObrigatoria(payload.dataHoraAbertura, "Data de abertura")
    : undefined;
  const novoFechamento = payload.dataHoraFechamento
    ? dataObrigatoria(payload.dataHoraFechamento, "Data de fechamento")
    : undefined;
  if (!novaAbertura && !novoFechamento) throw erroValidacao("Informe abertura e/ou fechamento");

  try {
    return await executarEmTransacao(async (tx) => {
      const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
      if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw naoEncontrado("Caixa nao encontrado");
      if (caixa.status !== "aberto") throw erroValidacao("Caixa ja fechado");
      if (!caixa.pdvId) throw new Error("Caixa operacional invalido");

      const aberturaFinal = novaAbertura ?? (caixa.dataHoraAbertura ? new Date(caixa.dataHoraAbertura) : undefined);
      const fechamentoFinal = novoFechamento ?? (caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : null);
      if (aberturaFinal && fechamentoFinal && fechamentoFinal <= aberturaFinal) {
        throw erroValidacao("Fechamento precisa ser posterior a abertura");
      }

      const autorizadorId = temPermissao(perfil.permissoes, "caixa_alterar_horario")
        ? perfil.usuarioId
        : await consumirTokenAutorizacao(caixaId, perfil.usuarioId, payload.token, tx);

      if (novaAbertura && (await existePeriodoCaixaRepository(caixa.pdvId, novaAbertura, caixa.id, tx))) {
        throw erroValidacao(erroPeriodo);
      }

      const valoresAntigos = {
        dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
        dataHoraFechamento: serializarData(caixa.dataHoraFechamento)
      };
      await atualizarHorarioCaixaRepository(
        { caixaId: caixa.id, dataHoraAbertura: novaAbertura, dataHoraFechamento: novoFechamento },
        tx
      );
      const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
      if (!atualizado) throw naoEncontrado("Caixa nao encontrado");
      const revinculacao = await revincularVendasAoCaixa(atualizado, tx);

      await registrarEdicaoCaixaRepository(
        {
          caixaId: caixa.id,
          tokenUsado: null,
          autorizadorId,
          observacao,
          editadoPor: perfil.usuarioId,
          valoresAntigos,
          valoresNovos: {
            dataHoraAbertura: serializarData(atualizado.dataHoraAbertura),
            dataHoraFechamento: serializarData(atualizado.dataHoraFechamento),
            vendasAnexadas: revinculacao.anexadas,
            vendasDesanexadas: revinculacao.desanexadas
          }
        },
        tx
      );

      return {
        caixaAberto: serializarCaixa(atualizado),
        resumo: await calcularResumoCaixaOperacional(atualizado, tx),
        revinculacao
      };
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ErroDominio)) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

export async function acertarSaldoCaixaOperacional(
  caixaId: string,
  dados: AcertarSaldoCaixaPayload,
  perfil: PerfilUsuario
) {
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    const totais = await calcularTotaisCaixaCentavos(caixa, tx);
    const saldoCentavos = saldoCaixaCentavos(totais);
    if (saldoCentavos <= 0) throw new Error("Nao ha diferenca positiva para acertar");
    const grupo = await buscarGrupoQuebraCaixa(caixa.empresaId, tx);
    const resultado = await criarAcertoSaldoCaixaRepository(
      {
        caixaId: caixa.id,
        empresaId: caixa.empresaId,
        colaboradorId: caixa.colaboradorId,
        contaOrigemId: caixa.pdvContaId,
        grupoDespesaId: grupo?.id ?? null,
        valorDiferencaCentavos: saldoCentavos,
        observacao: dados.observacao?.trim() || null,
        criadoPor: perfil.usuarioId,
        data: new Date().toISOString().slice(0, 10)
      },
      tx
    );
    return { ...resultado, valorDiferenca: deCentavos(saldoCentavos) };
  });
}

export async function fecharCaixa(caixaId: string, dados: FecharCaixaPayload, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    const dataHoraFechamento = new Date();
    if (caixa.dataHoraAbertura && dataHoraFechamento <= new Date(caixa.dataHoraAbertura)) {
      throw new Error("Fechamento precisa ser posterior a abertura");
    }
    const totais = await calcularTotaisCaixaCentavos(caixa, tx);
    const saldoCentavos = saldoCaixaCentavos(totais);
    if (saldoCentavos > 0) throw new Error("Acerto de saldo obrigatorio");

    await atualizarFechamentoCaixaRepository(
      {
        caixaId: caixa.id,
        dataHoraFechamento,
        observacao: dados.observacao?.trim() || caixa.observacao,
        totais,
        saldoCentavos
      },
      tx
    );

    return { caixaAberto: null, resumo: null } satisfies CaixaStatus;
  });
}

export async function listarHistoricoCaixa(empresaId: string, perfil: PerfilUsuario) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const historico = await listarHistoricoCaixaRepository(empresaId);
  return historico.map((caixa) => ({
    ...caixa,
    dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
    abertoEm: serializarData(caixa.abertoEm),
    dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
    fechadoEm: serializarData(caixa.fechadoEm),
    totalEntradas: numero(caixa.totalEntradas),
    totalTransferencias: numero(caixa.totalTransferencias),
    totalTransferenciasEntrada: numero(caixa.totalTransferenciasEntrada),
    totalTransferenciasSaida: numero(caixa.totalTransferenciasSaida),
    totalDespesas: numero(caixa.totalDespesas),
    totalRetiradas: numero(caixa.totalRetiradas),
    totalMercadorias: numero(caixa.totalMercadorias),
    saldo: numero(caixa.saldo)
  }));
}

export async function obterCaixaAbertoParaLancamento(empresaId: string, usuarioId: string, db?: ExecutorBanco) {
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, usuarioId, db);
  if (!caixa) throw new Error("Abra um caixa antes de registrar este lancamento");
  if (!caixa.pdvId || !caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  return caixa;
}

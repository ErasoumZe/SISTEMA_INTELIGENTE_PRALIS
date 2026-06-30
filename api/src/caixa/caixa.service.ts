import { randomBytes } from "node:crypto";
import type {
  AbrirCaixaPayload,
  AcertarSaldoCaixaPayload,
  AjusteSaldoPayload,
  AjusteSaldoResponse,
  CaixaOperacional,
  CaixaStatus,
  EditarAberturaCaixaPayload,
  FecharCaixaPayload,
  ResumoCaixa,
  ResumoCaixaQuery
} from "@padaria/shared/caixa";
import { temPermissao, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { saldoCaixa } from "./caixa.regras.js";
import {
  atualizarAberturaCaixaRepository,
  atualizarFechamentoCaixaRepository,
  buscarCaixaAbertoUsuarioRepository,
  buscarCaixaPorIdRepository,
  buscarColaboradorPorUsuarioRepository,
  buscarGrupoQuebraCaixa,
  buscarPdvEmpresaRepository,
  buscarPerfilUsuarioCaixaRepository,
  caixaTemLancamentosRepository,
  calcularTotaisCaixaOperacionalRepository,
  criarAcertoSaldoCaixaRepository,
  criarAjusteSaldoCaixa,
  criarCaixaRepository,
  existeCaixaAbertoPdvRepository,
  existePeriodoCaixaRepository,
  listarHistoricoCaixaRepository,
  obterTotaisCaixa,
  registrarEdicaoCaixaRepository
} from "./caixa.repository.js";

const erroPeriodo = "A data e hora de abertura ja pertence a outro caixa aberto/fechado";

type CaixaLinha = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

function gerarTokenEdicao() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function dataObrigatoria(valor: string, campo: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error(`${campo} invalida`);
  return data;
}

function numero(valor: string | number | null | undefined) {
  return deCentavos(paraCentavos(valor));
}

function calcularSaldoOperacional(resumo: Omit<ResumoCaixa, "saldo" | "totalTransferencias">) {
  return deCentavos(
    paraCentavos(resumo.totalEntradas) +
      paraCentavos(resumo.totalTransferenciasEntrada ?? 0) -
      paraCentavos(resumo.totalTransferenciasSaida ?? 0) -
      paraCentavos(resumo.totalDespesas) -
      paraCentavos(resumo.totalRetiradas) -
      paraCentavos(resumo.totalMercadorias ?? 0)
  );
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

export async function obterResumoCaixa(query: ResumoCaixaQuery): Promise<ResumoCaixa> {
  const totais = await obterTotaisCaixa(query);
  const totalEntradas = Number(totais.totalEntradas);
  const totalTransferencias = Number(totais.totalTransferencias);
  const totalDespesas = Number(totais.totalDespesas);
  const totalRetiradas = Number(totais.totalRetiradas);

  return {
    totalEntradas,
    totalTransferencias,
    totalDespesas,
    totalRetiradas,
    saldo: saldoCaixa({ totalEntradas, totalTransferencias, totalDespesas, totalRetiradas })
  };
}

export async function acertarSaldoCaixa(dados: AjusteSaldoPayload, usuarioId: string): Promise<AjusteSaldoResponse> {
  if (dados.valorDiferenca === 0) throw new Error("Nao ha diferenca para acertar");

  const grupo = await buscarGrupoQuebraCaixa(dados.empresaId);
  const despesa = await criarAjusteSaldoCaixa(dados, grupo?.id ?? null, usuarioId);

  return { despesaId: despesa.id };
}

export async function calcularResumoCaixaOperacional(caixa: CaixaLinha): Promise<ResumoCaixa> {
  if (!caixa.pdvContaId) throw new Error("PDV sem conta vinculada");
  const totais = await calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId);
  const resumo = {
    totalEntradas: numero(totais.totalEntradas),
    totalTransferencias: numero(totais.totalTransferencias),
    totalTransferenciasEntrada: numero(totais.totalTransferenciasEntrada),
    totalTransferenciasSaida: numero(totais.totalTransferenciasSaida),
    totalDespesas: numero(totais.totalDespesas),
    totalRetiradas: numero(totais.totalRetiradas),
    totalMercadorias: numero(totais.totalMercadorias)
  };
  return {
    ...resumo,
    saldo: calcularSaldoOperacional(resumo)
  };
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

export async function abrirCaixa(dados: AbrirCaixaPayload, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, dados.empresaId)) throw new Error("Empresa nao permitida");
  const dataHoraAbertura = dataObrigatoria(dados.dataHoraAbertura, "Data de abertura");

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
        observacao: dados.observacao?.trim() || null
      },
      tx
    );
    const aberto = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!aberto) throw new Error("Caixa nao encontrado apos abertura");
    return { caixaAberto: serializarCaixa(aberto), resumo: await calcularResumoCaixaOperacional(aberto) };
  });
}

export async function editarAberturaCaixa(
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
    return { caixaAberto: serializarCaixa(atualizado), resumo: await calcularResumoCaixaOperacional(atualizado) };
  });
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
    const resumo = await calcularResumoCaixaOperacional(caixa);
    if (resumo.saldo <= 0) throw new Error("Nao ha diferenca positiva para acertar");
    const grupo = await buscarGrupoQuebraCaixa(caixa.empresaId, tx);
    const resultado = await criarAcertoSaldoCaixaRepository(
      {
        caixaId: caixa.id,
        empresaId: caixa.empresaId,
        colaboradorId: caixa.colaboradorId,
        contaOrigemId: caixa.pdvContaId,
        grupoDespesaId: grupo?.id ?? null,
        valorDiferenca: resumo.saldo,
        observacao: dados.observacao?.trim() || null,
        criadoPor: perfil.usuarioId,
        data: new Date().toISOString().slice(0, 10)
      },
      tx
    );
    return { ...resultado, valorDiferenca: resumo.saldo };
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
    const resumo = await calcularResumoCaixaOperacional(caixa);
    if (resumo.saldo > 0) throw new Error("Acerto de saldo obrigatorio");

    await atualizarFechamentoCaixaRepository(
      {
        caixaId: caixa.id,
        dataHoraFechamento,
        observacao: dados.observacao?.trim() || caixa.observacao,
        totalEntradas: resumo.totalEntradas,
        totalTransferenciasEntrada: resumo.totalTransferenciasEntrada ?? 0,
        totalTransferenciasSaida: resumo.totalTransferenciasSaida ?? 0,
        totalDespesas: resumo.totalDespesas,
        totalRetiradas: resumo.totalRetiradas,
        totalMercadorias: resumo.totalMercadorias ?? 0,
        saldo: resumo.saldo
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

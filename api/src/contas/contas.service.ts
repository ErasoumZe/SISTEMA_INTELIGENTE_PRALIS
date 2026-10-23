import type { DadosExternos } from "@padaria/shared/api";
import {
  ajusteSaldoContaPayloadSchema,
  contaPayloadSchema,
  type ExportarContaPayload as ExportarPayload,
  type ImportarContasPayload as ImportarPayload,
  zerarSaldosContasPayloadSchema
} from "@padaria/shared/contas";
import { podeAjustarSaldoContas, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { exigirContaAlvoDaEmpresa, exigirUsuarioDaEmpresa } from "../contas-usuarios/contas-usuarios.validacao.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import {
  copiarContasRepository,
  inserirAjustesContasRepository,
  listarIdsContasDaEmpresaRepository,
  listarContasComSaldoRepository,
  listarContasRepository,
  saldosDasContasRepository,
  salvarContaRepository,
  travarContasRepository
} from "./contas.repository.js";

export async function listarContas(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarContasRepository(), escopoDados);
}

// Tela de Contas (D8): fundo + saldo ATUAL derivado + usuarios vinculados. Separada de listarContas
// porque aquela e a lista de OPCAO de formulario (id/nome) e e chamada em quase toda tela — nao vale
// pagar as consultas de movimento so para preencher um <select>.
export async function listarContasComSaldo(escopoDados: string[]) {
  return listarContasComSaldoRepository(escopoDados);
}

function exigirPodeAjustarSaldo(perfil?: PerfilUsuario): asserts perfil is PerfilUsuario {
  if (!perfil || !podeAjustarSaldoContas(perfil))
    throw new Error("Somente Administrador total ou Tesouraria pode ajustar saldo de conta");
}

function exigirEmpresaDoAjuste(perfil: PerfilUsuario, empresaId: string) {
  if (!empresasPermitidas(perfil).includes(empresaId)) throw new Error("Empresa nao permitida");
}

/**
 * O cliente informa o saldo-alvo, nunca o delta. A diferenca e calculada depois da trava da conta
 * para que dois ajustes simultaneos nao usem o mesmo saldo anterior. O registro resultante soma na
 * projecao normal e futuras saidas/entradas continuam alterando o saldo sem excecao.
 */
export async function ajustarSaldoConta(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const dados = ajusteSaldoContaPayloadSchema.parse(body);
  exigirPodeAjustarSaldo(perfil);
  exigirEmpresaDoAjuste(perfil, dados.empresaId);

  return executarEmTransacao(async (tx) => {
    const [conta] = await travarContasRepository([id], dados.empresaId, tx);
    if (!conta) throw new Error("Conta nao encontrada nesta empresa");

    const saldos = await saldosDasContasRepository([dados.empresaId], tx, [id]);
    const saldoAnteriorCentavos = paraCentavos(saldos.get(id) ?? conta.saldoInicial);
    const saldoPosteriorCentavos = paraCentavos(dados.saldoDesejado);
    const valorAjusteCentavos = saldoPosteriorCentavos - saldoAnteriorCentavos;
    if (!valorAjusteCentavos) throw new Error("A conta ja esta com o saldo informado");

    const [ajuste] = await inserirAjustesContasRepository(
      [
        {
          empresaId: dados.empresaId,
          contaId: id,
          valor: deCentavos(valorAjusteCentavos),
          saldoAnterior: deCentavos(saldoAnteriorCentavos),
          saldoPosterior: deCentavos(saldoPosteriorCentavos),
          motivo: dados.motivo,
          criadoPor: perfil.usuarioId
        }
      ],
      tx
    );
    return {
      ...ajuste,
      saldoAnterior: deCentavos(saldoAnteriorCentavos),
      saldoPosterior: deCentavos(saldoPosteriorCentavos)
    };
  });
}

/** Zera todas as contas da empresa em uma transacao, sem apagar os movimentos que formaram o saldo. */
export async function zerarSaldosContas(body: DadosExternos, perfil?: PerfilUsuario) {
  const dados = zerarSaldosContasPayloadSchema.parse(body);
  exigirPodeAjustarSaldo(perfil);
  exigirEmpresaDoAjuste(perfil, dados.empresaId);

  return executarEmTransacao(async (tx) => {
    const ids = await listarIdsContasDaEmpresaRepository(dados.empresaId, tx);
    if (!ids.length) return { ajustadas: [] };

    const contasTravadas = await travarContasRepository(
      ids.map((conta) => conta.id),
      dados.empresaId,
      tx
    );
    const saldos = await saldosDasContasRepository(
      [dados.empresaId],
      tx,
      contasTravadas.map((conta) => conta.id)
    );
    const ajustes = contasTravadas.flatMap((conta) => {
      const saldoAnteriorCentavos = paraCentavos(saldos.get(conta.id) ?? conta.saldoInicial);
      if (!saldoAnteriorCentavos) return [];
      return [
        {
          empresaId: dados.empresaId,
          contaId: conta.id,
          valor: deCentavos(-saldoAnteriorCentavos),
          saldoAnterior: deCentavos(saldoAnteriorCentavos),
          saldoPosterior: 0,
          motivo: dados.motivo,
          criadoPor: perfil.usuarioId
        }
      ];
    });
    await inserirAjustesContasRepository(ajustes, tx);
    return {
      ajustadas: ajustes.map((ajuste) => ({
        contaId: ajuste.contaId,
        saldoAnterior: ajuste.saldoAnterior,
        saldoPosterior: 0
      }))
    };
  });
}

export async function salvarConta(id: string | null, body: DadosExternos) {
  const dados = contaPayloadSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    if (id) await exigirContaAlvoDaEmpresa(id, dados.empresaId, tx);

    if (dados.usuariosIds !== undefined) {
      for (const usuarioId of new Set(dados.usuariosIds)) {
        await exigirUsuarioDaEmpresa(usuarioId, dados.empresaId, tx);
      }
    }

    return salvarContaRepository(
      {
        ...(id ? { id } : {}),
        empresaId: dados.empresaId,
        nome: dados.nome.trim(),
        ...(dados.saldoInicial === undefined ? {} : { saldoInicial: dados.saldoInicial }),
        ...(dados.usuariosIds === undefined ? {} : { usuariosIds: dados.usuariosIds })
      },
      tx
    );
  });
}

export async function importarContas(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarContasRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarConta(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarContasRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}

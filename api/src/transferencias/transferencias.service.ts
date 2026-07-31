import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  ConfirmarTransferenciaPayload,
  TransferenciaCriada,
  TransferenciaDetalheDto,
  TransferenciaDto,
  TransferenciaPayload,
  TransferenciasQuery
} from "@padaria/shared/transferencias";
import { executarEmTransacao } from "../banco/conexao.js";
import { buscarCaixaAbertoUsuarioRepository, listarUsuariosTesourariaRepository } from "../caixa/caixa.repository.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasTransferencia
} from "../lancamentos/lancamentos.dominio.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import {
  atualizarTransferenciaRepository,
  buscarTransferenciaDetalheRepository,
  confirmarTransferenciaRepository,
  contasPertencemEmpresaRepository,
  criarTransferenciaRepository,
  efetivarTransferenciasAgendadasRepository,
  liberarTravaTransferenciaRepository,
  listarDestinatariosTransferenciaRepository,
  listarTransferenciasVencidasRepository,
  listarTransferenciasRepository
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

export function podeTransferirSemCaixa(perfil: PerfilUsuario) {
  if (perfil.role === "usuario_admin" || perfil.role === "admin") return true;
  const prefixosLiberados = ["tesouraria", "gerencia", "gerente", "financeiro", "diretor geral"];
  return perfil.cargos.some((cargo) =>
    prefixosLiberados.some((prefixo) => normalizarCargo(cargo.nome).startsWith(prefixo))
  );
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
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const contasValidas = await contasPertencemEmpresaRepository(
      [dados.contaOrigemId, dados.contaDestinoId, ...dados.contasDestinoIds],
      dados.empresaId,
      tx
    );
    if (!contasValidas) throw new Error("Conta de origem ou destino nao pertence a empresa informada");

    const transferenciaLivre = podeTransferirSemCaixa(perfil);
    const caixa = transferenciaLivre
      ? await buscarCaixaAbertoUsuarioRepository(dados.empresaId, perfil.usuarioId, tx)
      : await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const envolveContaPdv =
      caixa && (dados.contaOrigemId === caixa.pdvContaId || dados.contaDestinoId === caixa.pdvContaId);
    if (!transferenciaLivre && !envolveContaPdv) {
      throw new Error("Transferencia do operador Caixa precisa envolver a conta do PDV aberto");
    }

    const transferencia = await criarTransferenciaRepository(
      dados,
      computar,
      perfil.usuarioId,
      envolveContaPdv ? caixa.id : null,
      tx
    );
    return { id: transferencia.id, computar };
  });
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
    const confirmada = await confirmarTransferenciaRepository(transferenciaId, dados, perfil.usuarioId, tx);
    if (!confirmada) throw new Error("Somente operador de uma conta destino pode confirmar uma unica vez");

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

export async function processarTransferenciasTemporais(agora = new Date()) {
  await executarEmTransacao(async (tx) => {
    await efetivarTransferenciasAgendadasRepository(agora, tx);
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
    const existente = await buscarTransferenciaDetalheRepository(transferenciaId, tx);
    const caixa = await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    if ((dados.maloteId ?? null) !== existente!.maloteId) {
      throw new Error("Nao e possivel alterar o malote na edicao");
    }
    const referenciaInvalida = await validarReferenciasTransferencia(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    if (dados.contaOrigemId !== caixa.pdvContaId && dados.contaDestinoId !== caixa.pdvContaId) {
      throw new Error("Transferencia precisa envolver a conta do PDV aberto");
    }
    await atualizarTransferenciaRepository(transferenciaId, dados, computar, tx);
    return { id: transferenciaId, computar };
  });
}

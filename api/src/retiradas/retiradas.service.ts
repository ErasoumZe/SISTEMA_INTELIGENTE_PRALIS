import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  RetiradaCriada,
  RetiradaDetalheDto,
  RetiradaDto,
  RetiradaPayload,
  RetiradasQuery
} from "@padaria/shared/retiradas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoEditarPago,
  exigirPermissaoLancamento,
  exigirPermissaoPagar,
  obterCaixaParaLancamento,
  podeVerLancamentosPagos
} from "../lancamentos/lancamentos.dominio.js";
import { exigirDataPagamentoNaoRetroativa, resolverObservacaoDoLancamento } from "../lancamentos/texto-movimento.js";
import {
  exigirCredorDaRetirada,
  exigirContaDoCaixaNoLancamento,
  exigirRecorrenciaDeRetaguarda,
  resolverComputarLancamento,
  validarEdicaoDeSaidaNoCaixa,
  validarReferenciasRetirada
} from "../lancamentos/lancamentos.dominio.js";
import {
  caixaDaOcorrencia,
  exigirPermissaoRecorrencia,
  payloadDaOcorrencia,
  planejarRecorrencia
} from "../lancamentos/lancamentos.recorrencia.js";
import {
  atualizarFotoRetiradaRepository,
  atualizarRetiradaRepository,
  buscarRetiradaDetalheRepository,
  travarRetiradaRepository,
  criarRetiradaRepository,
  listarRetiradasRepository
} from "./retiradas.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export async function listarRetiradas(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null,
  perfil?: PerfilUsuario
): Promise<RetiradaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  // visualizar_dpago (R7): sem a permissao, a listagem nunca traz lancamentos ja pagos (server-side).
  const esconderPagos = !perfil || !podeVerLancamentosPagos(perfil.permissoes, "retiradas");
  return listarRetiradasRepository(query, empresasPermitidasIds, esconderPagos);
}

export async function criarRetirada(dados: RetiradaPayload, perfil: PerfilUsuario): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas_criar");
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  // Ciclo de vida (R7): definir dataPagamento na criacao exige *_pagar (aditivo com caixas_gerenciar).
  exigirPermissaoPagar(perfil.permissoes, "retiradas", dados.dataPagamento);
  // R-129: pagamento retroativo nao entra na CRIACAO (fuso do negocio, nao UTC).
  exigirDataPagamentoNaoRetroativa(dados.dataPagamento);
  // R-123 ANTES da permissao: para o operador de caixa a recusa precisa dizer o MOTIVO ("e ato de
  // Tesouraria/Financeiro"), nao um "permissao insuficiente" que nao explica nada.
  exigirRecorrenciaDeRetaguarda(perfil, dados.recorrencia);
  // Recorrencia (D3): junto das demais permissoes, antes de qualquer trabalho.
  exigirPermissaoRecorrencia(perfil, dados.recorrencia);
  // R-128 no servidor: retirada NOVA nao aceita colaborador. Sem `existente`, e criacao.
  exigirCredorDaRetirada(dados);
  const normalizados = resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null });
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasRetirada(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    // R-121: para o operador de Caixa a saida tem de sair da conta do PDV aberto.
    const lancamento = exigirContaDoCaixaNoLancamento(normalizados, caixa, perfil);

    // Recorrencia (D3): a serie inteira nasce na MESMA transacao (ver a nota em criarDespesa).
    const plano = await planejarRecorrencia(
      {
        empresaId: dados.empresaId,
        dominio: "retirada",
        dataReferencia: dados.dataReferencia,
        dataVencimento: dados.dataVencimento,
        recorrencia: dados.recorrencia,
        perfil
      },
      tx
    );
    if (!plano) {
      const retirada = await criarRetiradaRepository(lancamento, computar, perfil.usuarioId, caixa.id, tx);
      return { id: retirada.id, computar };
    }

    let primeira = "";
    for (const ocorrencia of plano.ocorrencias) {
      const criada = await criarRetiradaRepository(
        payloadDaOcorrencia(lancamento, ocorrencia),
        computar,
        perfil.usuarioId,
        caixaDaOcorrencia(caixa.id, ocorrencia),
        tx,
        ocorrencia.vinculo
      );
      if (ocorrencia.ehPrimeira) primeira = criada.id;
    }
    return { id: primeira, computar, serie: plano.ocorrencias.length, serieLimitada: plano.limitadaPeloTeto };
  });
}

export async function obterRetirada(retiradaId: string, perfil: PerfilUsuario): Promise<RetiradaDetalheDto> {
  const retirada = await buscarRetiradaDetalheRepository(retiradaId);
  if (!retirada || !podeAcessarEmpresa(perfil, retirada.empresaId)) throw new Error("Registro nao encontrado");
  return retirada;
}

export async function salvarFotoRetirada(
  retiradaId: string,
  campo: "documento" | "nota",
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
) {
  const retirada = await buscarRetiradaDetalheRepository(retiradaId);
  if (!retirada || !podeAcessarEmpresa(perfil, retirada.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("retiradas", retiradaId, arquivo);
  await atualizarFotoRetiradaRepository(retiradaId, retirada.empresaId, campo, caminhoRelativo);
  return campo === "nota" ? { fotoNotaUrl: caminhoRelativo } : { fotoDocumentoUrl: caminhoRelativo };
}

export async function obterFotoRetirada(retiradaId: string, campo: "documento" | "nota", perfil: PerfilUsuario) {
  const retirada = await buscarRetiradaDetalheRepository(retiradaId);
  if (!retirada || !podeAcessarEmpresa(perfil, retirada.empresaId)) throw new Error("Registro nao encontrado");
  const caminho = campo === "nota" ? retirada.fotoNotaUrl : retirada.fotoDocumentoUrl;
  if (!caminho) throw new Error("Foto nao encontrada");
  return { caminhoAbsoluto: caminhoAbsolutoDocumento(caminho), mimeType: mimePorCaminho(caminho) };
}

export async function atualizarRetirada(
  retiradaId: string,
  dados: RetiradaPayload,
  perfil: PerfilUsuario
): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas_editar");
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  return executarEmTransacao(async (tx) => {
    // TRAVA antes de ler — ver a nota em `atualizarDespesa`. Sem isto, duas edicoes concorrentes
    // liam o mesmo retrato e a segunda ressuscitava o credor legado E a divida do colaborador.
    if (!(await travarRetiradaRepository(retiradaId, tx))) throw new Error("Registro nao encontrado");
    const existente = await buscarRetiradaDetalheRepository(retiradaId, tx);
    const caixa = await validarEdicaoDeSaidaNoCaixa(existente, dados, perfil, tx);
    // Ciclo de vida (R7): editar retirada JA PAGA exige *_editar_dpago; alterar dataPagamento exige *_pagar.
    exigirPermissaoEditarPago(perfil.permissoes, "retiradas", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "retiradas", dados.dataPagamento, existente!.dataPagamento ?? null);
    // R-129 na edicao: so vale se a data MUDOU — registro antigo continua editavel.
    exigirDataPagamentoNaoRetroativa(dados.dataPagamento, existente!.dataPagamento);
    // R-128 na EDICAO: o colaborador so continua no registro que JA era dele. Retirada moderna nao
    // vira retirada de colaborador pela porta do PUT.
    exigirCredorDaRetirada(dados, existente);
    const referenciaInvalida = await validarReferenciasRetirada(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    // R-121 tambem na EDICAO — ver a nota em `atualizarDespesa`: corpo sem conta zerava a conta
    // travada e mantinha o `caixa_id`.
    const normalizados = exigirContaDoCaixaNoLancamento(
      resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null }),
      caixa,
      perfil
    );
    await atualizarRetiradaRepository(retiradaId, normalizados, computar, existente!.caixaId, perfil.usuarioId, tx);
    return { id: retiradaId, computar };
  });
}

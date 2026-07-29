import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  DespesaCriada,
  DespesaDetalheDto,
  DespesaDto,
  DespesaPayload,
  DespesasQuery,
  DiscriminarDespesaPayload
} from "@padaria/shared/despesas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoEditarPago,
  exigirPermissaoLancamento,
  exigirPermissaoPagar,
  obterCaixaParaLancamento,
  podeVerLancamentosPagos,
  exigirDiscriminacaoConferida,
  itemDespesaParaDiscriminacao,
  validarReferenciasItensDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarDespesaRepository,
  atualizarFotoDespesaRepository,
  buscarDespesaDetalheRepository,
  criarDespesaRepository,
  discriminarDespesaRepository,
  listarDespesasRepository
} from "./despesas.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export function validarDespesa(dados: DespesaPayload): void {
  if (!dados.grupoDespesaId && !dados.itensDespesa.length) throw new Error("Grupo ou itens da despesa obrigatorios");
  // D5 (§5): a soma da discriminacao tem de bater com o Valor do lancamento. Nao bateu, NAO SALVA —
  // e a resposta diz ONDE diverge (422 com detalhe), em vez de um 400 seco.
  if (dados.itensDespesa.length)
    exigirDiscriminacaoConferida(dados.itensDespesa.map(itemDespesaParaDiscriminacao), dados.valorOriginal);
}

export async function listarDespesas(
  query: DespesasQuery,
  empresasPermitidasIds: string[] | null,
  perfil?: PerfilUsuario
): Promise<DespesaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  // visualizar_dpago (R7): sem a permissao, a listagem nunca traz lancamentos ja pagos (server-side).
  const esconderPagos = !perfil || !podeVerLancamentosPagos(perfil.permissoes, "despesas");
  return listarDespesasRepository(query, empresasPermitidasIds, esconderPagos);
}

export async function criarDespesa(dados: DespesaPayload, perfil: PerfilUsuario): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_criar");
  validarDespesa(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  // Ciclo de vida (R7): definir dataPagamento na criacao exige *_pagar (aditivo: *_pagar OU o legado
  // caixas_gerenciar). Sem, 403 em vez do antigo strip silencioso.
  exigirPermissaoPagar(perfil.permissoes, "despesas", dados.dataPagamento);
  const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const despesa = await criarDespesaRepository(normalizados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: despesa.id, computar };
  });
}

export async function obterDespesa(despesaId: string, perfil: PerfilUsuario): Promise<DespesaDetalheDto> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  return despesa;
}

// Anexo de foto do documento (nota/cupom) — insumo de quem discrimina depois.
export async function salvarFotoDespesa(
  despesaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoDocumentoUrl: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("despesas", despesaId, arquivo);
  await atualizarFotoDespesaRepository(despesaId, despesa.empresaId, caminhoRelativo);
  return { fotoDocumentoUrl: caminhoRelativo };
}

export async function obterFotoDespesa(
  despesaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!despesa.fotoDocumentoUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(despesa.fotoDocumentoUrl),
    mimeType: mimePorCaminho(despesa.fotoDocumentoUrl)
  };
}

export async function atualizarDespesa(
  despesaId: string,
  dados: DespesaPayload,
  perfil: PerfilUsuario
): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_editar");
  validarDespesa(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  return executarEmTransacao(async (tx) => {
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    // Ciclo de vida (R7): editar um lancamento JA PAGO exige *_editar_dpago; alterar a dataPagamento
    // exige *_pagar. Ambos comparam com o estado atual do registro.
    exigirPermissaoEditarPago(perfil.permissoes, "despesas", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "despesas", dados.dataPagamento, existente!.dataPagamento ?? null);
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
    await atualizarDespesaRepository(despesaId, normalizados, computar, existente!.caixaId, perfil.usuarioId, tx);
    return { id: despesaId, computar };
  });
}

// Discriminacao feita por outro setor DEPOIS: substitui os itens do cabecalho existente.
// De proposito NAO passa por validarEdicaoNoCaixaAberto — desacopla do caixa (pode estar fechado).
export async function discriminarDespesa(
  despesaId: string,
  dados: DiscriminarDespesaPayload,
  perfil: PerfilUsuario
): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_discriminar");
  return executarEmTransacao(async (tx) => {
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

    exigirDiscriminacaoConferida(dados.itensDespesa.map(itemDespesaParaDiscriminacao), existente.valorOriginal);

    const referenciaInvalida = await validarReferenciasItensDespesa(dados.empresaId, dados.itensDespesa, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    await discriminarDespesaRepository(
      despesaId,
      dados,
      existente.grupoDespesaId ?? null,
      existente.colaboradorId ?? null,
      tx
    );
    return { id: despesaId, computar: existente.computar };
  });
}

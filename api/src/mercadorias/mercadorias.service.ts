import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  AprovarMercadoriaPayload,
  DiscriminarMercadoriaPayload,
  MercadoriaAprovacaoDto,
  MercadoriaCriada,
  MercadoriaDetalheDto,
  MercadoriaDto,
  MercadoriaPayload,
  MercadoriasAprovacaoQuery,
  MercadoriasQuery,
  RecusarMercadoriaPayload
} from "@padaria/shared/mercadorias";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirDiscriminacaoConferida,
  itemMercadoriaParaDiscriminacao,
  exigirPermissaoEditarPago,
  exigirPermissaoLancamento,
  exigirPermissaoPagar,
  obterCaixaParaLancamento,
  podeVerLancamentosPagos,
  validarReferenciasItensMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import {
  exigirContaDoCaixaNoLancamento,
  exigirRecorrenciaDeRetaguarda,
  resolverComputarLancamento,
  validarEdicaoDeSaidaNoCaixa,
  validarReferenciasMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import {
  caixaDaOcorrencia,
  exigirPermissaoRecorrencia,
  payloadDaOcorrencia,
  planejarRecorrencia
} from "../lancamentos/lancamentos.recorrencia.js";
import { deveComputarMercadoria } from "./mercadorias.regras.js";
import {
  aprovarMercadoriaRepository,
  atualizarFotoMercadoriaRepository,
  atualizarFotoNotaMercadoriaRepository,
  atualizarMercadoriaRepository,
  buscarMercadoriaDetalheRepository,
  criarMercadoriaRepository,
  discriminarMercadoriaRepository,
  listarMercadoriasAguardandoAprovacaoRepository,
  listarMercadoriasRepository,
  recusarMercadoriaRepository
} from "./mercadorias.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export function validarMercadoria(dados: MercadoriaPayload): void {
  if (!dados.grupoMercadoriaId && !dados.itensMercadoria.length) {
    throw new Error("Grupo ou itens de mercadoria obrigatorios");
  }
  // D5 (§5): a soma da discriminacao tem de bater com o Valor do lancamento. Nao bateu, NAO SALVA —
  // e a resposta diz ONDE diverge (422 com detalhe), em vez de um 400 seco.
  if (dados.itensMercadoria.length)
    exigirDiscriminacaoConferida(dados.itensMercadoria.map(itemMercadoriaParaDiscriminacao), dados.valorOriginal);
}

export async function listarMercadorias(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null,
  perfil?: PerfilUsuario
): Promise<MercadoriaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  // visualizar_dpago (R7): sem a permissao, a listagem nunca traz lancamentos ja pagos (server-side).
  const esconderPagos = !perfil || !podeVerLancamentosPagos(perfil.permissoes, "mercadorias");
  return listarMercadoriasRepository(query, empresasPermitidasIds, esconderPagos);
}

export async function criarMercadoria(dados: MercadoriaPayload, perfil: PerfilUsuario): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_criar");
  validarMercadoria(dados);
  // Ciclo de vida (R7): definir dataPagamento na criacao exige *_pagar (aditivo com caixas_gerenciar).
  exigirPermissaoPagar(perfil.permissoes, "mercadorias", dados.dataPagamento);
  // R-123 ANTES da permissao: para o operador de caixa a recusa precisa dizer o MOTIVO ("e ato de
  // Tesouraria/Financeiro"), nao um "permissao insuficiente" que nao explica nada.
  exigirRecorrenciaDeRetaguarda(perfil, dados.recorrencia);
  // Recorrencia (D3): junto das demais permissoes, antes de qualquer trabalho.
  exigirPermissaoRecorrencia(perfil, dados.recorrencia);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    // R-121: para o operador de Caixa a saida tem de sair da conta do PDV aberto.
    const lancamento = exigirContaDoCaixaNoLancamento(normalizados, caixa, perfil);

    // Recorrencia (D3): a serie inteira nasce na MESMA transacao (ver a nota em criarDespesa).
    const plano = await planejarRecorrencia(
      {
        empresaId: dados.empresaId,
        dominio: "mercadoria",
        dataReferencia: dados.dataReferencia,
        dataVencimento: dados.dataVencimento,
        recorrencia: dados.recorrencia,
        perfil
      },
      tx
    );
    if (!plano) {
      const mercadoria = await criarMercadoriaRepository(lancamento, computar, perfil.usuarioId, caixa.id, tx);
      return { id: mercadoria.id, computar };
    }

    let primeira = "";
    for (const ocorrencia of plano.ocorrencias) {
      const criada = await criarMercadoriaRepository(
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

export async function obterMercadoria(mercadoriaId: string, perfil: PerfilUsuario): Promise<MercadoriaDetalheDto> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  return mercadoria;
}

// Anexo de foto do documento (nota/cupom) — insumo de quem discrimina depois.
export async function salvarFotoMercadoria(
  mercadoriaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoDocumentoUrl: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("mercadorias", mercadoriaId, arquivo);
  await atualizarFotoMercadoriaRepository(mercadoriaId, mercadoria.empresaId, caminhoRelativo);
  return { fotoDocumentoUrl: caminhoRelativo };
}

export async function obterFotoMercadoria(
  mercadoriaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!mercadoria.fotoDocumentoUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(mercadoria.fotoDocumentoUrl),
    mimeType: mimePorCaminho(mercadoria.fotoDocumentoUrl)
  };
}

export async function salvarFotoNotaMercadoria(
  mercadoriaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoNotaUrl: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("mercadorias", mercadoriaId, arquivo);
  await atualizarFotoNotaMercadoriaRepository(mercadoriaId, mercadoria.empresaId, caminhoRelativo);
  return { fotoNotaUrl: caminhoRelativo };
}

export async function obterFotoNotaMercadoria(
  mercadoriaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!mercadoria.fotoNotaUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(mercadoria.fotoNotaUrl),
    mimeType: mimePorCaminho(mercadoria.fotoNotaUrl)
  };
}

export async function atualizarMercadoria(
  mercadoriaId: string,
  dados: MercadoriaPayload,
  perfil: PerfilUsuario
): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_editar");
  validarMercadoria(dados);
  return executarEmTransacao(async (tx) => {
    const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
    await validarEdicaoDeSaidaNoCaixa(existente, dados, perfil, tx);
    // Ciclo de vida (R7): editar mercadoria JA PAGA exige *_editar_dpago; alterar dataPagamento exige *_pagar.
    exigirPermissaoEditarPago(perfil.permissoes, "mercadorias", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "mercadorias", dados.dataPagamento, existente!.dataPagamento ?? null);
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
    await atualizarMercadoriaRepository(mercadoriaId, normalizados, computar, tx);
    return { id: mercadoriaId, computar };
  });
}

// Discriminacao feita por outro setor DEPOIS: substitui os itens do cabecalho existente.
// De proposito NAO passa por validarEdicaoNoCaixaAberto — desacopla do caixa (pode estar fechado).
export async function discriminarMercadoria(
  mercadoriaId: string,
  dados: DiscriminarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_discriminar");
  return executarEmTransacao(async (tx) => {
    const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

    exigirDiscriminacaoConferida(dados.itensMercadoria.map(itemMercadoriaParaDiscriminacao), existente.valorOriginal);

    const referenciaInvalida = await validarReferenciasItensMercadoria(dados.empresaId, dados.itensMercadoria, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    await discriminarMercadoriaRepository(mercadoriaId, dados, existente.grupoMercadoriaId ?? null, tx);
    return { id: mercadoriaId, computar: existente.computar };
  });
}

// Fila de aprovacao (NF-e): lista os cabecalhos aguardando aprovacao (com itens do XML).
export async function listarMercadoriasAguardandoAprovacao(
  query: MercadoriasAprovacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaAprovacaoDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarMercadoriasAguardandoAprovacaoRepository(query, empresasPermitidasIds);
}

// Aprova a mercadoria da NF-e definindo se computa (decisao da reuniao: nota so fiscal nao computa).
export async function aprovarMercadoria(
  mercadoriaId: string,
  dados: AprovarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; computar: boolean }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (mercadoria.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  if (mercadoria.status !== "aguardando_aprovacao") throw new Error("Mercadoria nao esta aguardando aprovacao");
  const afetadas = await aprovarMercadoriaRepository(mercadoriaId, dados.empresaId, dados.computar);
  if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
  return { id: mercadoriaId, computar: dados.computar };
}

// Recusa a mercadoria da NF-e (aguardando_aprovacao -> recusado).
export async function recusarMercadoria(
  mercadoriaId: string,
  dados: RecusarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (mercadoria.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  if (mercadoria.status !== "aguardando_aprovacao") throw new Error("Mercadoria nao esta aguardando aprovacao");
  const afetadas = await recusarMercadoriaRepository(mercadoriaId, dados.empresaId);
  if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
  return { id: mercadoriaId };
}

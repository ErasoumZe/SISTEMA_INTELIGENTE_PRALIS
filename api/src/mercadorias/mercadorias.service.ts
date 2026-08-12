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
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { travarCaixaCompartilhadoRepository } from "../caixa/caixa.repository.js";
import { paraCentavos } from "@padaria/shared/dinheiro";
import {
  exigirDiscriminacaoConferida,
  itemMercadoriaParaDiscriminacao,
  exigirPermissaoEditarPago,
  exigirPermissaoLancamento,
  exigirPermissaoPagar,
  caixaIdDaSaida,
  exigirSaldoSuficienteNaConta,
  saldoJaReservadoNaMesmaConta,
  exigirContaForaDoCaixaFechadoNaCorrida,
  obterCaixaDaSaida,
  obterCaixaDaSaidaParaEdicao,
  podeVerLancamentosPagos,
  validarReferenciasItensMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import { exigirDataPagamentoNaoRetroativa, resolverObservacaoDoLancamento } from "../lancamentos/texto-movimento.js";
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
  travarMercadoriaRepository,
  criarMercadoriaRepository,
  discriminarMercadoriaRepository,
  listarMercadoriasAguardandoAprovacaoRepository,
  listarMercadoriasRepository,
  recusarMercadoriaRepository
} from "./mercadorias.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export function validarMercadoria(dados: MercadoriaPayload): void {
  // GRUPO e ITENS sao OPCIONAIS (decisao do Jose, 04/08/2026) — mesma razao da despesa: o campo
  // Grupo saiu do modal e vive so na discriminacao, que continua opcional. Ver validarDespesa.
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
  // R-129: pagamento retroativo nao entra na CRIACAO (fuso do negocio, nao UTC).
  exigirDataPagamentoNaoRetroativa(dados.dataPagamento);
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
    const normalizados = resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null });
    // A-1: a retaguarda lanca sem caixa aberto proprio (`caixa` vem `null`); o operador continua
    // exigindo o dele.
    const { caixa, caixaFechadoNaCorrida } = await obterCaixaDaSaida(dados.empresaId, perfil, tx);
    // R-121: para o operador de Caixa a saida tem de sair da conta do PDV aberto.
    const lancamento = exigirContaDoCaixaNoLancamento(normalizados, caixa, perfil);
    // Q2: retaguarda com a conta do PDV de um caixa que fechou na corrida e recusada.
    exigirContaForaDoCaixaFechadoNaCorrida(caixaFechadoNaCorrida, lancamento.contaOrigemId);
    // So conta para o caixa o que saiu da conta do PDV dele.
    const caixaId = caixaIdDaSaida(caixa, lancamento);

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
    // R-165: porta de saldo depois do caixa e depois do plano — a serie inteira sai da MESMA conta
    // de uma vez (ver a nota em criarDespesa).
    await exigirSaldoSuficienteNaConta(
      {
        empresaId: dados.empresaId,
        contaOrigemId: lancamento.contaOrigemId,
        valorCentavos: paraCentavos(lancamento.valorOriginal) * (plano ? plano.ocorrencias.length : 1)
      },
      tx
    );

    if (!plano) {
      const mercadoria = await criarMercadoriaRepository(lancamento, computar, perfil.usuarioId, caixaId, tx);
      return { id: mercadoria.id, computar };
    }

    let primeira = "";
    for (const ocorrencia of plano.ocorrencias) {
      const criada = await criarMercadoriaRepository(
        payloadDaOcorrencia(lancamento, ocorrencia),
        computar,
        perfil.usuarioId,
        caixaDaOcorrencia(caixaId, ocorrencia),
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
    // P0 — ordem unica de locks: caixa (FOR SHARE) antes da linha do lancamento.
    const caixaTravado = await obterCaixaDaSaidaParaEdicao(dados.empresaId, perfil, tx);
    // TRAVA antes de ler — ver a nota em `atualizarDespesa`. As tres saidas tem o mesmo contrato.
    if (!(await travarMercadoriaRepository(mercadoriaId, dados.empresaId, tx))) {
      throw new Error("Registro nao encontrado");
    }
    const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
    const caixa = validarEdicaoDeSaidaNoCaixa(existente, dados, perfil, caixaTravado);
    // Ciclo de vida (R7): editar mercadoria JA PAGA exige *_editar_dpago; alterar dataPagamento exige *_pagar.
    exigirPermissaoEditarPago(perfil.permissoes, "mercadorias", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "mercadorias", dados.dataPagamento, existente!.dataPagamento ?? null);
    // R-129 na edicao: so vale se a data MUDOU — registro antigo continua editavel.
    exigirDataPagamentoNaoRetroativa(dados.dataPagamento, existente!.dataPagamento);
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    // R-121 tambem na EDICAO — ver a nota em `atualizarDespesa`: corpo sem conta zerava a conta
    // travada e mantinha o `caixa_id`.
    const normalizados = exigirContaDoCaixaNoLancamento(
      resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null }),
      caixa,
      perfil
    );
    // Q2 tambem na edicao: a conta do PDV de um caixa que fechou na corrida nao recebe escrita.
    exigirContaForaDoCaixaFechadoNaCorrida(caixaTravado.caixaFechadoNaCorrida, normalizados.contaOrigemId);
    // R-165 na EDICAO: delta real — ver a nota em `atualizarDespesa`. `computar` ja resolvido acima
    // porque a NF-e sem nota nao computa: o que nao vai pesar no saldo nao precisa de lastro.
    await exigirSaldoSuficienteNaConta(
      {
        empresaId: dados.empresaId,
        contaOrigemId: normalizados.contaOrigemId,
        valorCentavos: computar ? paraCentavos(normalizados.valorOriginal) : 0,
        jaReservadoCentavos: saldoJaReservadoNaMesmaConta(existente, normalizados.contaOrigemId)
      },
      tx
    );
    // A-4: `caixa_id` pela MESMA funcao do POST — ver a nota em `atualizarDespesa`.
    await atualizarMercadoriaRepository(mercadoriaId, normalizados, computar, caixaIdDaSaida(caixa, normalizados), tx);
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
    // TRAVA antes de ler — ver a nota em `discriminarDespesa`: a conferencia da soma compara com o
    // `valorOriginal` GRAVADO, e a discriminacao reescreve os itens.
    if (!(await travarMercadoriaRepository(mercadoriaId, dados.empresaId, tx))) {
      throw new Error("Registro nao encontrado");
    }
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

// S5 (R-164): aprovar/recusar NF-e muda status e computar — altera os sete totais quando a
// mercadoria carrega `caixa_id` (o PUT da retaguarda pode carimbar o caixa antes da aprovacao).
// As duas rotas entram na porta: transacao, caixa PRIMEIRO (FOR SHARE + revalidacao; fechado
// recusa — totais congelados nao ganham vida nova), linha da mercadoria depois, decisao sobre o
// retrato SOB a trava. Se um PUT concorrente carimbou OUTRO caixa entre as duas leituras,
// recomecar e mais barato (e sem risco de ciclo) que travar fora da ordem unica.
async function prepararAtoDeAprovacao(
  mercadoriaId: string,
  empresaId: string,
  perfil: PerfilUsuario,
  tx: TransacaoBanco
) {
  const previa = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
  if (!previa || !podeAcessarEmpresa(perfil, previa.empresaId)) throw new Error("Registro nao encontrado");
  if (previa.empresaId !== empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  if (previa.caixaId) {
    const trava = await travarCaixaCompartilhadoRepository(previa.caixaId, tx);
    if (trava?.status !== "aberto") throw new Error("Caixa ja fechado");
  }
  if (!(await travarMercadoriaRepository(mercadoriaId, empresaId, tx))) throw new Error("Registro nao encontrado");
  const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
  if (!existente || existente.status !== "aguardando_aprovacao") {
    throw new Error("Mercadoria nao esta aguardando aprovacao");
  }
  if ((existente.caixaId ?? null) !== (previa.caixaId ?? null)) {
    throw new Error("Lancamento mudou de caixa durante a aprovacao: tente novamente");
  }
  return existente;
}

// Aprova a mercadoria da NF-e definindo se computa (decisao da reuniao: nota so fiscal nao computa).
export async function aprovarMercadoria(
  mercadoriaId: string,
  dados: AprovarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; computar: boolean }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  return executarEmTransacao(async (tx) => {
    const existente = await prepararAtoDeAprovacao(mercadoriaId, dados.empresaId, perfil, tx);
    // R-165: aprovar LIGANDO `computar` faz o dinheiro passar a sair da conta — e um debito novo,
    // ainda que nenhum valor mude. Sem esta porta, a NF-e criada com `computar = false` viraria a
    // porta dos fundos do P0. Se ja computava, `jaReservado` anula a cobranca (delta zero).
    await exigirSaldoSuficienteNaConta(
      {
        empresaId: dados.empresaId,
        contaOrigemId: existente.contaOrigemId,
        valorCentavos: dados.computar ? paraCentavos(existente.valorOriginal) : 0,
        jaReservadoCentavos: saldoJaReservadoNaMesmaConta(existente, existente.contaOrigemId)
      },
      tx
    );
    const afetadas = await aprovarMercadoriaRepository(mercadoriaId, dados.empresaId, dados.computar, tx);
    if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
    return { id: mercadoriaId, computar: dados.computar };
  });
}

// Recusa a mercadoria da NF-e (aguardando_aprovacao -> recusado).
export async function recusarMercadoria(
  mercadoriaId: string,
  dados: RecusarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  return executarEmTransacao(async (tx) => {
    await prepararAtoDeAprovacao(mercadoriaId, dados.empresaId, perfil, tx);
    const afetadas = await recusarMercadoriaRepository(mercadoriaId, dados.empresaId, tx);
    if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
    return { id: mercadoriaId };
  });
}

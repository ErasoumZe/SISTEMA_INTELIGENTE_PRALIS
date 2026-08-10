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
  caixaIdDaSaida,
  obterCaixaDaSaida,
  podeVerLancamentosPagos,
  exigirDiscriminacaoConferida,
  exigirVinculoDosItensDespesa,
  itemDespesaParaDiscriminacao,
  validarReferenciasItensDespesa
} from "../lancamentos/lancamentos.dominio.js";
import { exigirDataPagamentoNaoRetroativa, resolverObservacaoDoLancamento } from "../lancamentos/texto-movimento.js";
import {
  exigirCredorCoerenteDaDespesa,
  exigirContaDoCaixaNoLancamento,
  exigirRecorrenciaDeRetaguarda,
  resolverComputarLancamento,
  validarEdicaoDeSaidaNoCaixa,
  validarReferenciasDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarDespesaRepository,
  atualizarFotoDespesaRepository,
  atualizarFotoNotaDespesaRepository,
  buscarDespesaDetalheRepository,
  travarDespesaRepository,
  criarDespesaRepository,
  discriminarDespesaRepository,
  listarDespesasRepository
} from "./despesas.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";
import {
  caixaDaOcorrencia,
  exigirPermissaoRecorrencia,
  payloadDaOcorrencia,
  planejarRecorrencia
} from "../lancamentos/lancamentos.recorrencia.js";

export function validarDespesa(dados: DespesaPayload): void {
  // GRUPO e ITENS sao OPCIONAIS (decisao do Jose, 04/08/2026). Antes exigia "grupo ou itens", mas o
  // campo Grupo saiu do modal — ele agora vive so na discriminacao, e a discriminacao continua
  // opcional. Exigir aqui deixaria o lancamento simples impossivel de salvar, com uma mensagem
  // apontando um campo que nao existe mais na tela.
  //
  // Consequencia aceita e registrada: lancamento sem grupo e sem itens fica SEM classificacao no
  // cockpit por categoria e no DRE. Ele conta no total e no caixa normalmente; o que ele nao tem e
  // grupo. A coluna ja era nullable no banco e o contrato ja era `optional().nullable()`.
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
  // R-135: na CRIACAO nada e legado — toda linha e nova e tem de vir do cadastro.
  exigirVinculoDosItensDespesa(dados.itensDespesa, null);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  // Ciclo de vida (R7): definir dataPagamento na criacao exige *_pagar (aditivo: *_pagar OU o legado
  // caixas_gerenciar). Sem, 403 em vez do antigo strip silencioso.
  exigirPermissaoPagar(perfil.permissoes, "despesas", dados.dataPagamento);
  // R-129: pagamento retroativo nao entra na CRIACAO (fuso do negocio, nao UTC).
  exigirDataPagamentoNaoRetroativa(dados.dataPagamento);
  // R-123 ANTES da permissao: para o operador de caixa a recusa precisa dizer o MOTIVO ("e ato de
  // Tesouraria/Financeiro"), nao um "permissao insuficiente" que nao explica nada.
  exigirRecorrenciaDeRetaguarda(perfil, dados.recorrencia);
  // Recorrencia (D3): junto das demais permissoes, antes de qualquer trabalho.
  exigirPermissaoRecorrencia(perfil, dados.recorrencia);
  // Um tipo de credor por vez. Sem `existente`, e criacao: nao existe historico para preservar.
  exigirCredorCoerenteDaDespesa(dados);
  const normalizados = resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null });
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    // A-1: a retaguarda lanca sem caixa aberto proprio (`caixa` vem `null`); o operador continua
    // exigindo o dele.
    const caixa = await obterCaixaDaSaida(dados.empresaId, perfil, tx);
    // R-121: para o operador de Caixa a saida tem de sair da conta do PDV aberto.
    const lancamento = exigirContaDoCaixaNoLancamento(normalizados, caixa, perfil);
    // So conta para o caixa o que saiu da conta do PDV dele.
    const caixaId = caixaIdDaSaida(caixa, lancamento);

    // Recorrencia (D3): a serie inteira nasce aqui, na MESMA transacao. Ou entram todos os 12
    // lancamentos, ou nenhum — meia serie gravada seria pior que erro nenhum.
    const plano = await planejarRecorrencia(
      {
        empresaId: dados.empresaId,
        dominio: "despesa",
        dataReferencia: dados.dataReferencia,
        dataVencimento: dados.dataVencimento,
        recorrencia: dados.recorrencia,
        perfil
      },
      tx
    );
    if (!plano) {
      const despesa = await criarDespesaRepository(lancamento, computar, perfil.usuarioId, caixaId, tx);
      return { id: despesa.id, computar };
    }

    let primeira = "";
    for (const ocorrencia of plano.ocorrencias) {
      const criada = await criarDespesaRepository(
        payloadDaOcorrencia(lancamento, ocorrencia),
        computar,
        perfil.usuarioId,
        caixaDaOcorrencia(caixaId, ocorrencia),
        tx,
        ocorrencia.vinculo
      );
      if (ocorrencia.ehPrimeira) primeira = criada.id;
    }
    // O id devolvido e o do lancamento que a pessoa criou (o 1o da serie), nao o do ultimo.
    return { id: primeira, computar, serie: plano.ocorrencias.length, serieLimitada: plano.limitadaPeloTeto };
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

export async function salvarFotoNotaDespesa(
  despesaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoNotaUrl: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("despesas", despesaId, arquivo);
  await atualizarFotoNotaDespesaRepository(despesaId, despesa.empresaId, caminhoRelativo);
  return { fotoNotaUrl: caminhoRelativo };
}

export async function obterFotoNotaDespesa(
  despesaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!despesa.fotoNotaUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(despesa.fotoNotaUrl),
    mimeType: mimePorCaminho(despesa.fotoNotaUrl)
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
    // TRAVA antes de ler: daqui para baixo, `existente` e o retrato sob lock, e nenhuma outra
    // transacao altera a linha ate esta terminar. Toda validacao que compara com o estado anterior
    // — a excecao de credor legado, a conta gravada, a data de pagamento — usa ESTE retrato.
    if (!(await travarDespesaRepository(despesaId, dados.empresaId, tx))) throw new Error("Registro nao encontrado");
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    const caixa = await validarEdicaoDeSaidaNoCaixa(existente, dados, perfil, tx);
    // Ciclo de vida (R7): editar um lancamento JA PAGO exige *_editar_dpago; alterar a dataPagamento
    // exige *_pagar. Ambos comparam com o estado atual do registro.
    exigirPermissaoEditarPago(perfil.permissoes, "despesas", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "despesas", dados.dataPagamento, existente!.dataPagamento ?? null);
    // R-129 na edicao: so vale se a data MUDOU — registro antigo continua editavel.
    exigirDataPagamentoNaoRetroativa(dados.dataPagamento, existente!.dataPagamento);
    // R-135 na EDICAO, DEPOIS das travas de identidade/permissao: a linha JA GRAVADA sem vinculo
    // continua podendo ser salva (registro historico nao pode virar refem da regra nova); linha nova
    // sem vinculo, nao. Se viesse antes, um id inexistente responderia "falta vinculo" em vez de
    // "registro nao encontrado".
    exigirVinculoDosItensDespesa(dados.itensDespesa, existente!.itensDespesa);
    // Um tipo de credor por vez, sem punir o historico: se o par de credores chega igual ao que
    // esta gravado, o operador esta mexendo em outro campo.
    exigirCredorCoerenteDaDespesa(dados, existente);
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    // R-121 tambem na EDICAO: `validarEdicaoDeSaidaNoCaixa` recusa uma conta DIFERENTE, mas corpo
    // SEM conta passava direto e gravava `conta_origem_id = NULL` mantendo o `caixa_id` — o valor
    // saia do saldo da conta e continuava no fechamento do caixa. A mesma funcao da criacao repoe a
    // conta do PDV; para a retaguarda ela devolve os dados intactos.
    const normalizados = exigirContaDoCaixaNoLancamento(
      resolverObservacaoDoLancamento({ ...dados, dataPagamento: dados.dataPagamento ?? null }),
      caixa,
      perfil
    );
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
    // TRAVA antes de ler, como na edicao: a discriminacao decide contra o registro GRAVADO
    // (`valorOriginal` para a conferencia da soma, e os itens para a R-135) e escreve nas MESMAS
    // tabelas. Sem o lock, uma edicao concorrente que sanea o registro era desfeita por uma
    // discriminacao validada contra o retrato velho — o mesmo defeito da edicao, pela porta de tras.
    if (!(await travarDespesaRepository(despesaId, dados.empresaId, tx))) {
      throw new Error("Registro nao encontrado");
    }
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

    exigirDiscriminacaoConferida(dados.itensDespesa.map(itemDespesaParaDiscriminacao), existente.valorOriginal);
    // R-135 na DISCRIMINACAO: o cabecalho pendente nao tem item gravado, entao aqui e tudo linha
    // nova e tudo precisa vir do cadastro. Rediscriminar um registro legado preserva as linhas dele.
    exigirVinculoDosItensDespesa(dados.itensDespesa, existente.itensDespesa);

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

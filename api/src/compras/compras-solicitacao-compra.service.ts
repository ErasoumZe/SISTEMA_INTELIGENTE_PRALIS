import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeConvidar } from "@padaria/shared";
import {
  localDoInstante,
  resumoRecorrencia,
  type EnviarSolicitacaoCompraPayload,
  type RodadaDto,
  type SolicitacaoCompraCardDto,
  type SolicitacaoCompraDetalheDto
} from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { aprovarVinculosRepository } from "./compras-convidar.repository.js";
import {
  fornecedoresDoCatalogoRepository,
  listarAgendasRepository,
  produtosDasAgendasRepository
} from "./compras-agendamento.repository.js";
import { horaCurta, instantesDaSerie, rankingsDaEmpresa, terminoDaLinha } from "./compras-agendamento.service.js";
import { listarEstoqueProdutosRepository } from "./compras.repository.js";
import { buscarFornecedoresParaConviteRepository, travarRodadaDaSolicitacao } from "./compras-rodadas.repository.js";
import { abrirRodadaNaTransacao } from "./compras-rodadas.service.js";
import { substituirItensNaTransacao } from "./compras-solicitacoes.service.js";
import {
  buscarOcorrenciaRepository,
  itensDaSolicitacaoRepository,
  pendentesDasAgendasRepository,
  travarOcorrenciaRepository
} from "./compras-solicitacao-compra.repository.js";

// Solicitacao de compra (doc 58 §2, Rodrigo 23/10/2026). Cada agendamento e um card do responsavel; na data ele
// confere, poe as quantidades e envia. Cada fornecedor do catalogo recebe so os seus produtos pelo WhatsApp;
// produto sem fornecedor recebe o que o responsavel escolher, e o vinculo vai para o catalogo.

const HORIZONTE_DIAS = 3 * 366;

function validarEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

/** Quem gere agendamentos ve e executa qualquer pedido; os demais, so os seus. */
const geraTodos = (perfil: PerfilUsuario) => perfil.permissoes.includes("agendamento_pedidos_gerir");

function exigirResponsavel(perfil: PerfilUsuario, responsavelId: string) {
  if (perfil.usuarioId !== responsavelId && !geraTodos(perfil))
    throw proibido("Este pedido e de outro responsavel", "NOT_RESPONSIBLE");
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export async function listarSolicitacoesCompra(
  empresaId: string,
  perfil: PerfilUsuario,
  agora = new Date()
): Promise<SolicitacaoCompraCardDto[]> {
  validarEmpresa(perfil, empresaId);
  const agendas = (await listarAgendasRepository(empresaId)).filter(
    (agenda) => geraTodos(perfil) || agenda.responsavelId === perfil.usuarioId
  );
  const ids = agendas.map((agenda) => agenda.id);
  const [produtos, pendentes] = await Promise.all([
    produtosDasAgendasRepository(ids),
    pendentesDasAgendasRepository(ids)
  ]);
  return agendas.map((agenda) => {
    const termino = terminoDaLinha(agenda);
    const inicio = localDoInstante(agenda.inicioEm, agenda.fusoHorario);
    const hoje = localDoInstante(agora, agenda.fusoHorario).data;
    const proxima = instantesDaSerie({ ...agenda, termino }, somarDias(hoje, HORIZONTE_DIAS)).find(
      (data) => data > agora
    );
    return {
      agendaId: agenda.id,
      grupoNome: agenda.grupoNome,
      grupoPaiNome: agenda.grupoPaiNome,
      responsavelId: agenda.responsavelId,
      responsavelNome: agenda.responsavelNome,
      resumo: resumoRecorrencia(agenda.regra, inicio.data, termino),
      totalProdutos: produtos.filter((produto) => produto.agendaId === agenda.id).length,
      proximaData: proxima?.toISOString() ?? null,
      pendentes: pendentes
        .filter((pendente) => pendente.agendaId === agenda.id)
        .map((pendente) => ({ ocorrenciaId: pendente.ocorrenciaId, dataAtual: pendente.dataAtual.toISOString() }))
    };
  });
}

async function ocorrenciaParaEnviar(id: string, empresaId: string, perfil: PerfilUsuario) {
  const ocorrencia = await buscarOcorrenciaRepository(id, empresaId);
  if (!ocorrencia || !ocorrencia.solicitacaoId) throw naoEncontrado("Solicitacao de compra nao encontrada");
  exigirResponsavel(perfil, ocorrencia.responsavelId);
  if (ocorrencia.situacao !== "aguardando_conferencia")
    throw conflito("Esta solicitacao ja foi enviada ou cancelada", "OCCURRENCE_NOT_PENDING");
  return { ...ocorrencia, solicitacaoId: ocorrencia.solicitacaoId };
}

/** Os fornecedores do catalogo que podem receber a cotacao (ativos e com WhatsApp), por produto. */
async function fornecedoresQuePodemReceber(empresaId: string, produtoIds: string[]) {
  const catalogo = await fornecedoresDoCatalogoRepository(empresaId, produtoIds);
  const porProduto = new Map<string, Array<{ fornecedorId: string; nome: string }>>();
  for (const vinculo of catalogo) {
    if (podeConvidar({ situacao: vinculo.situacao, whatsapp: vinculo.whatsapp })) continue;
    const lista = porProduto.get(vinculo.produtoId) ?? [];
    if (!lista.some((item) => item.fornecedorId === vinculo.fornecedorId))
      lista.push({ fornecedorId: vinculo.fornecedorId, nome: vinculo.nome });
    porProduto.set(vinculo.produtoId, lista);
  }
  return porProduto;
}

export async function detalharSolicitacaoCompra(
  id: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<SolicitacaoCompraDetalheDto> {
  validarEmpresa(perfil, empresaId);
  const ocorrencia = await ocorrenciaParaEnviar(id, empresaId, perfil);
  const [produtosDaAgenda, itensSolicitacao, estoque, rankings] = await Promise.all([
    produtosDasAgendasRepository([ocorrencia.agendaId]),
    itensDaSolicitacaoRepository(ocorrencia.solicitacaoId),
    listarEstoqueProdutosRepository({ empresaId }),
    rankingsDaEmpresa(empresaId)
  ]);
  const sugerida = new Map(itensSolicitacao.map((item) => [item.produtoId, item.quantidade]));
  const produtoIds = [...new Set([...produtosDaAgenda.map((produto) => produto.produtoId), ...sugerida.keys()])];
  const fornecedores = await fornecedoresQuePodemReceber(empresaId, produtoIds);
  const estoquePorId = new Map(estoque.map((produto) => [produto.id, produto]));
  return {
    ocorrenciaId: ocorrencia.id,
    grupoNome: ocorrencia.grupoNome,
    dataAtual: ocorrencia.dataAtual.toISOString(),
    prazoRespostaHoras: ocorrencia.prazoRespostaHoras,
    margemVariacaoPercentual: ocorrencia.margemVariacaoPercentual,
    recebimentoInicio: horaCurta(ocorrencia.recebimentoInicio),
    recebimentoFim: horaCurta(ocorrencia.recebimentoFim),
    itens: produtoIds
      .map((produtoId) => {
        const produto = estoquePorId.get(produtoId);
        return {
          produtoId,
          descricao: produto?.descricao ?? "Produto",
          unidade: produto?.unidade ?? null,
          estoqueAtual: produto?.quantidadeEstoque ?? null,
          estoqueMax: produto?.estoqueMax ?? null,
          quantidadeSugerida: sugerida.get(produtoId) ?? null,
          fornecedores: fornecedores.get(produtoId) ?? [],
          maisVende: rankings.maisVende.has(produtoId),
          maisCompra: rankings.maisCompra.has(produtoId),
          maisLucro: rankings.maisLucro.has(produtoId)
        };
      })
      .sort((a, b) => a.descricao.localeCompare(b.descricao))
  };
}

/**
 * Envia: grava as quantidades na solicitacao do dia e abre a cotacao, tudo numa transacao. A ocorrencia vira
 * "enviada" dentro de abrirRodadaNaTransacao; os convites entram na fila do WhatsApp.
 */
export async function enviarSolicitacaoCompra(
  id: string,
  payload: EnviarSolicitacaoCompraPayload,
  perfil: PerfilUsuario
): Promise<RodadaDto> {
  validarEmpresa(perfil, payload.empresaId);
  const base = await ocorrenciaParaEnviar(id, payload.empresaId, perfil);
  const produtosDaAgenda = new Set(
    (await produtosDasAgendasRepository([base.agendaId])).map((produto) => produto.produtoId)
  );
  for (const item of payload.itens)
    if (!produtosDaAgenda.has(item.produtoId))
      throw erroValidacao("Produto fora deste agendamento", "PRODUCT_NOT_IN_SCHEDULE");
  const catalogo = await fornecedoresQuePodemReceber(
    payload.empresaId,
    payload.itens.map((item) => item.produtoId)
  );
  const escolhidos = [...new Set(payload.itens.flatMap((item) => (item.fornecedorId ? [item.fornecedorId] : [])))];

  return executarEmTransacao(async (tx) => {
    await travarRodadaDaSolicitacao(base.solicitacaoId, tx);
    const ocorrencia = await travarOcorrenciaRepository(id, payload.empresaId, tx);
    if (!ocorrencia || ocorrencia.situacao !== "aguardando_conferencia")
      throw conflito("Esta solicitacao ja foi enviada ou cancelada", "OCCURRENCE_NOT_PENDING");

    // Fornecedor escolhido para produto sem catalogo: tem de poder receber (ativo e com WhatsApp).
    const fornecedoresEscolhidos = await buscarFornecedoresParaConviteRepository(payload.empresaId, escolhidos, tx);
    for (const fornecedorId of escolhidos) {
      const fornecedor = fornecedoresEscolhidos.find((item) => item.id === fornecedorId);
      if (!fornecedor) throw erroValidacao("Fornecedor nao pertence a empresa", "INVALID_SUPPLIER");
      const motivo = podeConvidar({
        situacao: fornecedor.situacao as "ativo" | "inativo",
        whatsapp: fornecedor.whatsapp
      });
      if (motivo) throw naoProcessavel(`${fornecedor.nome}: ${motivo}`, "FORNECEDOR_NAO_CONVIDAVEL");
    }

    await substituirItensNaTransacao(
      base.solicitacaoId,
      payload.empresaId,
      payload.itens.map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade })),
      `Solicitacao de compra: ${base.grupoNome}`,
      tx
    );
    const itens = await itensDaSolicitacaoRepository(base.solicitacaoId, tx);
    const itemPorProduto = new Map(itens.map((item) => [item.produtoId, item.id]));

    // Cada fornecedor recebe so os seus produtos: os do catalogo e os que o responsavel escolheu.
    const porFornecedor = new Map<string, Set<string>>();
    const semFornecedor: string[] = [];
    for (const item of payload.itens) {
      const destinos = item.fornecedorId
        ? [item.fornecedorId]
        : (catalogo.get(item.produtoId) ?? []).map((fornecedor) => fornecedor.fornecedorId);
      if (!destinos.length) semFornecedor.push(item.produtoId);
      for (const fornecedorId of destinos) {
        const lista = porFornecedor.get(fornecedorId) ?? new Set<string>();
        lista.add(itemPorProduto.get(item.produtoId)!);
        porFornecedor.set(fornecedorId, lista);
      }
    }
    if (semFornecedor.length)
      throw naoProcessavel(
        "Escolha o fornecedor de cada produto sem fornecedor",
        "PRODUCT_WITHOUT_SUPPLIER",
        semFornecedor
      );

    for (const fornecedorId of escolhidos)
      await aprovarVinculosRepository(
        {
          empresaId: payload.empresaId,
          fornecedorId,
          produtoIds: payload.itens.filter((item) => item.fornecedorId === fornecedorId).map((item) => item.produtoId),
          usuarioId: perfil.usuarioId
        },
        tx
      );

    return abrirRodadaNaTransacao(
      {
        empresaId: payload.empresaId,
        solicitacaoId: base.solicitacaoId,
        prazoRespostaHoras: base.prazoRespostaHoras,
        tetoValor: null,
        margemVariacaoPercentual: base.margemVariacaoPercentual as 10 | 20 | 30 | 40,
        recebimentoInicio: horaCurta(base.recebimentoInicio),
        recebimentoFim: horaCurta(base.recebimentoFim),
        convites: [...porFornecedor].map(([fornecedorId, solicitacaoItemIds]) => ({
          fornecedorId,
          solicitacaoItemIds: [...solicitacaoItemIds]
        }))
      },
      perfil.usuarioId,
      tx
    );
  });
}
